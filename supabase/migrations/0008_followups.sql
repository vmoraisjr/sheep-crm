-- Users can schedule but cannot forge sent/retry/lease states.
revoke insert,update,delete on public.followups from authenticated;
alter table public.followups drop constraint followups_status_check;
alter table public.followups add constraint followups_status_check check(status in ('pending','claimed','sending','sent','cancelled','failed','uncertain'));
alter table public.followups add column payload jsonb not null default '{}', add column lease_until timestamptz, add column claim_token uuid, add column last_error text, add column provider_message_id text;
grant insert(organization_id,conversation_id,opportunity_id,due_at,idempotency_key,payload) on public.followups to authenticated;
create table public.whatsapp_approved_templates(organization_id uuid not null references public.organizations(id) on delete cascade,channel_id uuid not null,name text not null,language text not null,approved boolean not null default false,verified_at timestamptz not null,primary key(organization_id,channel_id,name,language),foreign key(organization_id,channel_id) references public.channels(organization_id,id) on delete cascade);
alter table public.whatsapp_approved_templates enable row level security;
revoke all on public.whatsapp_approved_templates from anon,authenticated;
create table public.followup_audit(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,followup_id uuid not null,action text not null,reason text,created_at timestamptz not null default now(),foreign key(organization_id,followup_id) references public.followups(organization_id,id) on delete cascade);
alter table public.followup_audit enable row level security;
create policy tenant_read on public.followup_audit for select to authenticated using(public.is_org_member(organization_id));
grant select on public.followup_audit to authenticated;

-- Service-only worker never accepts a caller-supplied tenant scope.
create function public.claim_followups(p_now timestamptz,p_limit integer) returns setof public.followups language plpgsql security invoker set search_path=public as $$
begin
 -- Unknown provider outcome cannot safely be retried (Meta has no general idempotency key).
 update public.followups set status='uncertain',last_error='worker_lost_during_send' where status='sending' and lease_until<p_now;
 return query with due as (select id from public.followups where (status='pending' or (status='claimed' and lease_until<p_now)) and due_at<=p_now order by due_at for update skip locked limit least(greatest(p_limit,1),100))
 update public.followups f set status='claimed',claim_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1 from due where f.id=due.id returning f.*;
end $$;
create function public.prepare_followup(p_org uuid,p_id uuid,p_token uuid,p_now timestamptz) returns boolean language plpgsql security invoker set search_path=public as $$
declare f public.followups; c public.conversations; ct public.contacts; opp public.opportunities; reason text;
begin
 select * into strict f from public.followups where organization_id=p_org and id=p_id for update;
 if f.status<>'claimed' or f.claim_token is distinct from p_token or f.lease_until<now() then return false; end if;
 select * into strict c from public.conversations where organization_id=p_org and id=f.conversation_id for update;
 select * into strict ct from public.contacts where organization_id=p_org and id=c.contact_id for update;
 select * into strict opp from public.opportunities where organization_id=p_org and id=f.opportunity_id for update;
 if opp.contact_id<>c.contact_id then reason='opportunity_mismatch';
 elsif ct.opted_out or not ct.opted_in then reason='consent_required';
 elsif c.ai_paused then reason='human_priority';
 elsif f.payload ? 'template' and not exists(select 1 from public.whatsapp_approved_templates where organization_id=p_org and channel_id=c.channel_id and name=f.payload->'template'->>'name' and language=f.payload->'template'->>'language' and approved and verified_at>now()-interval '1 day') then reason='template_not_approved';
 elsif opp.stage in ('won','lost') then reason='opportunity_closed';
 elsif c.last_inbound_at>f.created_at then reason='customer_replied';
 elsif c.last_inbound_at>now() then reason='invalid_window';
 elsif now()-c.last_inbound_at>=interval '24 hours' and (c.channel_kind='instagram' or not exists(select 1 from public.whatsapp_approved_templates where organization_id=p_org and channel_id=c.channel_id and name=f.payload->'template'->>'name' and language=f.payload->'template'->>'language' and approved and verified_at>now()-interval '1 day')) then reason='outside_window';
 end if;
 if reason is not null then update public.followups set status='cancelled',last_error=reason where id=f.id;insert into public.followup_audit(organization_id,followup_id,action,reason) values(p_org,p_id,'cancelled',reason);return false;end if;
 update public.followups set status='sending',lease_until=now()+interval '2 minutes' where id=f.id;
 insert into public.followup_audit(organization_id,followup_id,action) values(p_org,p_id,'sending');
 return true;
end $$;
revoke all on function public.claim_followups(timestamptz,integer),public.prepare_followup(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_followups(timestamptz,integer),public.prepare_followup(uuid,uuid,uuid,timestamptz) to service_role;
grant select,insert,update,delete on public.followup_audit,public.whatsapp_approved_templates to service_role;

-- Authenticated simulation ingest may cancel schedules without receiving worker-state write access.
create function public.cancel_conversation_followups(p_org uuid,p_conversation uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' and not public.is_org_member(p_org) then raise exception 'Tenant inaccessible';end if;
 update public.followups set status='cancelled',last_error='customer_replied' where organization_id=p_org and conversation_id=p_conversation and status in ('pending','claimed');
end $$;
revoke all on function public.cancel_conversation_followups(uuid,uuid) from public,anon;
grant execute on function public.cancel_conversation_followups(uuid,uuid) to authenticated,service_role;
do $$ declare definition text; begin
 definition=pg_get_functiondef('public.ingest_inbound(jsonb)'::regprocedure);
 definition=replace(definition,'update public.followups set status=''cancelled'' where organization_id=org and conversation_id=conv.id and status in (''pending'',''claimed'');','perform public.cancel_conversation_followups(org,conv.id);');
 execute definition;
end $$;
create function public.complete_followup(p_org uuid,p_id uuid,p_token uuid,p_provider text,p_origin text,p_last_inbound timestamptz) returns void language plpgsql security invoker set search_path=public as $$
declare f public.followups; c public.conversations;
begin
 if p_origin not in ('meta','simulated') then raise exception 'Invalid origin';end if;
 select * into strict f from public.followups where organization_id=p_org and id=p_id and claim_token=p_token and status='sending' for update;
 select * into strict c from public.conversations where organization_id=p_org and id=f.conversation_id;
 insert into public.messages(organization_id,conversation_id,channel_id,provider_message_id,direction,text,occurred_at,origin,status)
 values(p_org,c.id,c.channel_id,p_provider,'outbound',coalesce(f.payload->>'text',''),now(),p_origin,'sent') on conflict(organization_id,channel_id,provider_message_id) do nothing;
 insert into public.usage_events(organization_id,event_key,kind,quantity) values(p_org,'followup-message:'||f.id,'message',1) on conflict do nothing;
 update public.conversations set unanswered=false where organization_id=p_org and id=c.id and last_inbound_at<=p_last_inbound;
 update public.followups set status='sent',provider_message_id=p_provider,last_error=null where id=f.id;
 insert into public.followup_audit(organization_id,followup_id,action) values(p_org,p_id,'sent_'||p_origin);
end $$;
revoke all on function public.complete_followup(uuid,uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.complete_followup(uuid,uuid,uuid,text,text,timestamptz) to service_role;
