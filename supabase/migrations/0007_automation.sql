create table public.automation_settings (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 config jsonb not null default '{"agentApproved":false,"openHour":9,"closeHour":18,"timeZone":"America/Sao_Paulo","maxRepliesPerHour":10,"tokenLimit":10000,"usageLimit":100,"limitMode":"hard"}', updated_at timestamptz not null default now()
);
create table public.automation_decisions (
 organization_id uuid not null references public.organizations(id) on delete cascade, message_id uuid not null,
 conversation_id uuid not null, status text not null check(status in ('claimed','committed','failed')), decision jsonb,
 claimed_at timestamptz not null default now(), primary key(organization_id,message_id),
 foreign key(organization_id,message_id) references public.messages(organization_id,id) on delete cascade,
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade
);
create table public.automation_outbox (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 conversation_id uuid not null, message_id uuid not null, text text not null, status text not null default 'pending' check(status in ('pending','sent','cancelled','failed','uncertain')),
 created_at timestamptz not null default now(), unique(organization_id,message_id),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade,
 foreign key(organization_id,message_id) references public.messages(organization_id,id) on delete cascade
);
alter table public.automation_settings enable row level security;
alter table public.automation_decisions enable row level security;
alter table public.automation_outbox enable row level security;
create policy tenant_read on public.automation_settings for select to authenticated using(public.is_org_member(organization_id));
create policy owner_config on public.automation_settings for all to authenticated using(exists(select 1 from public.memberships where organization_id=automation_settings.organization_id and user_id=auth.uid() and role in ('owner','admin'))) with check(exists(select 1 from public.memberships where organization_id=automation_settings.organization_id and user_id=auth.uid() and role in ('owner','admin')));
create policy tenant_read on public.automation_decisions for select to authenticated using(public.is_org_member(organization_id));
create policy tenant_read on public.automation_outbox for select to authenticated using(public.is_org_member(organization_id));
grant select,insert,update on public.automation_settings to authenticated;
grant select on public.automation_decisions, public.automation_outbox to authenticated;

create function public.claim_automation(p_org uuid,p_message uuid) returns boolean language plpgsql security invoker set search_path=public as $$
declare m public.messages; affected integer;
begin
 select * into strict m from public.messages where organization_id=p_org and id=p_message and direction='inbound';
 insert into public.automation_decisions(organization_id,message_id,conversation_id,status) values(p_org,p_message,m.conversation_id,'claimed')
 on conflict(organization_id,message_id) do update set status='claimed',claimed_at=now() where automation_decisions.status='failed' or (automation_decisions.status='claimed' and automation_decisions.claimed_at<now()-interval '5 minutes');
 get diagnostics affected=row_count; return affected=1;
end $$;
create function public.commit_automation(p_org uuid,p_message uuid,p_decision jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.conversations; ct public.contacts; cfg jsonb; profile_approved boolean := false; used bigint; hour_replies bigint; d jsonb:=p_decision; msg public.messages;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,7));
 select * into strict msg from public.messages where organization_id=p_org and id=p_message and direction='inbound';
 select * into strict c from public.conversations where organization_id=p_org and id=msg.conversation_id for update;
 select * into strict ct from public.contacts where organization_id=p_org and id=c.contact_id for update;
 select config into cfg from public.automation_settings where organization_id=p_org for update;
 if to_regclass('public.onboarding_profiles') is not null then
 execute 'select coalesce(agent_enabled and approved_at is not null and approved_revision=revision,false) from public.onboarding_profiles where organization_id=$1 for update' into profile_approved using p_org;
 end if;
 if not exists(select 1 from public.automation_decisions where organization_id=p_org and message_id=p_message and status='claimed') then raise exception 'Automation not claimed'; end if;
 if d->>'reason'='opt_out' then update public.contacts set opted_out=true where organization_id=p_org and id=ct.id; end if;
 select count(*) into used from public.usage_events where organization_id=p_org and kind='automated_conversation';
 select count(*) into hour_replies from public.automation_decisions where organization_id=p_org and status='committed' and decision->>'action'='reply' and claimed_at>now()-interval '1 hour';
 if d->>'action'='reply' and (c.ai_paused or ct.opted_out or not ct.opted_in or cfg is null or not coalesce(profile_approved,false) or hour_replies>=coalesce((cfg->>'maxRepliesPerHour')::integer,0) or (cfg->>'limitMode'='hard' and used>=coalesce((cfg->>'usageLimit')::integer,0))) then
 d=jsonb_build_object('action','skip','reason','human_priority','provider','deterministic','tokens',0,'costMicros',0);
 end if;
 if d->>'action'='reply' then
 insert into public.automation_outbox(organization_id,conversation_id,message_id,text) values(p_org,c.id,p_message,d->>'text') on conflict do nothing;
 insert into public.usage_events(organization_id,event_key,kind,quantity,cost_micros) values(p_org,'automated:'||c.id,'automated_conversation',1,0) on conflict do nothing;
 elsif d->>'action'='handoff' then
 update public.conversations set ai_paused=true where organization_id=p_org and id=c.id;
 insert into public.handoffs(organization_id,conversation_id,reason,context) values(p_org,c.id,d->>'reason',left(msg.text,2000));
 end if;
 update public.automation_decisions set status='committed',decision=d where organization_id=p_org and message_id=p_message;
 return d;
end $$;
revoke all on function public.claim_automation(uuid,uuid),public.commit_automation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_automation(uuid,uuid),public.commit_automation(uuid,uuid,jsonb) to service_role;

alter table public.automation_outbox drop constraint automation_outbox_status_check;
alter table public.automation_outbox add constraint automation_outbox_status_check check(status in ('pending','sending','sent','cancelled','failed','uncertain'));
alter table public.automation_outbox add column lease_until timestamptz, add column provider_message_id text;
create function public.claim_automation_outbox() returns setof public.automation_outbox language plpgsql security invoker set search_path=public as $$
begin
 update public.automation_outbox set status='uncertain' where status='sending' and lease_until<now();
 return query with jobs as(select id from public.automation_outbox where status='pending' order by created_at for update skip locked limit 25)
 update public.automation_outbox o set status='sending',lease_until=now()+interval '2 minutes' from jobs where o.id=jobs.id returning o.*;
end $$;
revoke all on function public.claim_automation_outbox() from public,anon,authenticated;
grant execute on function public.claim_automation_outbox() to service_role;
grant select,insert,update,delete on public.automation_settings,public.automation_decisions,public.automation_outbox to service_role;
