-- A2 CRM: ordered pipeline and server-authored transition history.
alter table public.opportunities drop constraint opportunities_stage_check;
alter table public.opportunities add constraint opportunities_stage_check check(stage in ('new','qualified','proposal','negotiation','won','lost'));
alter table public.opportunities add column position integer not null default 0 check(position>=0);
alter table public.opportunities add column movement_history jsonb not null default '[]';
create or replace function public.move_crm_opportunity(p_organization_id uuid,p_id uuid,p_stage text,p_position integer) returns void language plpgsql security invoker set search_path=public as $$
declare previous_stage text; target_ids uuid[]; destination integer;
begin
 if not public.is_org_member(p_organization_id) then raise exception 'Tenant access denied'; end if;
 if p_stage not in ('new','qualified','proposal','negotiation','won','lost') or p_position<0 then raise exception 'Invalid destination'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text,0));
 select stage into strict previous_stage from public.opportunities where organization_id=p_organization_id and id=p_id for update;
 select coalesce(array_agg(id order by position,created_at,id),'{}'::uuid[]) into target_ids from public.opportunities where organization_id=p_organization_id and stage=p_stage and id<>p_id;
 destination=least(p_position,cardinality(target_ids));
 target_ids=coalesce(target_ids[1:destination],'{}'::uuid[])||array[p_id]||coalesce(target_ids[destination+1:cardinality(target_ids)],'{}'::uuid[]);
 update public.opportunities set stage=p_stage,position=destination,
 movement_history=case when previous_stage<>p_stage then movement_history||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'opportunityId',p_id,'from',previous_stage,'to',p_stage,'actor',auth.uid(),'at',now(),'source','manual')) else movement_history end
 where organization_id=p_organization_id and id=p_id;
 update public.opportunities o set position=x.ordinality-1 from unnest(target_ids) with ordinality x(id,ordinality) where o.organization_id=p_organization_id and o.id=x.id;
end $$;
revoke all on function public.move_crm_opportunity(uuid,uuid,text,integer) from public,anon;
grant execute on function public.move_crm_opportunity(uuid,uuid,text,integer) to authenticated;
create table public.crm_tasks (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 contact_id uuid not null,due_at timestamptz not null,assignee text not null default '',notes text not null,completed boolean not null default false,
 created_at timestamptz not null default now(),foreign key(organization_id,contact_id) references public.contacts(organization_id,id) on delete cascade
);
alter table public.crm_tasks enable row level security;
create policy crm_tasks_tenant on public.crm_tasks for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
grant select,insert,update,delete on public.crm_tasks to authenticated;
grant all on public.crm_tasks to service_role;
-- Conversation lifecycle: closing also pauses the existing automation guard.
alter table public.conversations add column attendance_state text not null default 'paused' check(attendance_state in ('ai','human','paused','closed'));
update public.conversations set attendance_state=case when not ai_paused then 'ai' when assigned_to is not null then 'human' else 'paused' end;
alter table public.messages add column author_kind text check(author_kind in ('ai','human','customer'));
update public.messages set author_kind='customer' where direction='inbound';
-- Historical outbound messages deliberately remain unknown: provider origin does not identify the author.
create function public.a2_message_author() returns trigger language plpgsql set search_path=public as $$
begin
 if new.direction='inbound' then new.author_kind='customer';
 elsif new.author_kind is null and new.provider_message_id like 'automation:%' then new.author_kind='ai';
 end if;
 return new;
end $$;
create trigger a2_message_author before insert on public.messages for each row execute function public.a2_message_author();
create or replace function public.complete_automation_outbox(p_org uuid,p_id uuid,p_provider text) returns void language plpgsql security invoker set search_path=public as $$
declare item public.automation_outbox; c public.conversations; inbound public.messages;
begin
 select * into strict item from public.automation_outbox where organization_id=p_org and id=p_id and status='sending' for update;
 select * into strict c from public.conversations where organization_id=p_org and id=item.conversation_id;
 select * into strict inbound from public.messages where organization_id=p_org and id=item.message_id;
 insert into public.messages(organization_id,conversation_id,channel_id,provider_message_id,direction,text,occurred_at,origin,status,author_kind)
 values(p_org,c.id,c.channel_id,p_provider,'outbound',item.text,now(),'meta','sent','ai') on conflict(organization_id,channel_id,provider_message_id) do nothing;
 insert into public.usage_events(organization_id,event_key,kind,quantity) values(p_org,'automation-message:'||item.id,'message',1) on conflict do nothing;
 update public.conversations set unanswered=false where organization_id=p_org and id=c.id and last_inbound_at<=inbound.occurred_at;
 update public.automation_outbox set status='sent',provider_message_id=p_provider where id=item.id;
end $$;
-- Database-owned audit: direct API clients cannot overwrite or forge transition history.
create function public.audit_crm_stage() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then new.movement_history='[]';return new;end if;
 new.movement_history=old.movement_history;
 if new.stage is distinct from old.stage then
 new.movement_history=old.movement_history||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'opportunityId',new.id,'from',old.stage,'to',new.stage,'actor',auth.uid(),'at',now(),'source',case when auth.uid() is null then 'api' else 'manual' end));
 end if;
 return new;
end $$;
create trigger audit_crm_stage before insert or update on public.opportunities for each row execute function public.audit_crm_stage();
-- Configurable transitions create internal tasks only. Rules start disabled; no external dispatch.
create table public.crm_stage_rules (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 from_stage text not null,to_stage text not null,enabled boolean not null default false,
 task_notes text not null,delay_hours integer not null default 24 check(delay_hours>=0),unique(organization_id,from_stage,to_stage)
);
alter table public.crm_stage_rules enable row level security;
create policy crm_stage_rules_read on public.crm_stage_rules for select to authenticated using(public.is_org_member(organization_id));
create policy crm_stage_rules_manage on public.crm_stage_rules for all to authenticated using(exists(select 1 from public.memberships where organization_id=crm_stage_rules.organization_id and user_id=auth.uid() and role in ('owner','admin'))) with check(exists(select 1 from public.memberships where organization_id=crm_stage_rules.organization_id and user_id=auth.uid() and role in ('owner','admin')));
grant select,insert,update,delete on public.crm_stage_rules to authenticated;
grant all on public.crm_stage_rules to service_role;
alter table public.crm_tasks add column transition_id uuid unique;
create function public.create_stage_task() returns trigger language plpgsql security invoker set search_path=public as $$
declare rule public.crm_stage_rules; transition uuid;
begin
 if old.stage is not distinct from new.stage then return new;end if;
 transition=(new.movement_history->-1->>'id')::uuid;
 for rule in select * from public.crm_stage_rules where organization_id=new.organization_id and from_stage=old.stage and to_stage=new.stage and enabled loop
 insert into public.crm_tasks(organization_id,contact_id,due_at,assignee,notes,transition_id)
 values(new.organization_id,new.contact_id,now()+make_interval(hours=>rule.delay_hours),coalesce(new.assignee::text,''),rule.task_notes,transition) on conflict(transition_id) do nothing;
 end loop;
 return new;
end $$;
create trigger create_stage_task after update of stage on public.opportunities for each row execute function public.create_stage_task();
alter table public.opportunities add column title text not null default '';
alter table public.opportunities add column company text not null default '';
alter table public.opportunities add column priority text not null default 'normal' check(priority in ('high','normal','low'));
alter table public.opportunities add column expected_close_at timestamptz;
create or replace function public.update_crm_opportunity(p_organization_id uuid,p_id uuid,p_patch jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare ct uuid;
begin
 if not public.is_org_member(p_organization_id) then raise exception 'Tenant access denied'; end if;
 select contact_id into strict ct from public.opportunities where organization_id=p_organization_id and id=p_id for update;
 update public.opportunities set
 stage=case when p_patch ? 'stage' then p_patch->>'stage' else stage end,
 assignee=case when p_patch ? 'assignee' then auth.uid() else assignee end,
 next_action=case when p_patch ? 'nextAction' then p_patch->>'nextAction' else next_action end,
 value_cents=case when p_patch ? 'valueCents' then (p_patch->>'valueCents')::bigint else value_cents end,
 title=case when p_patch ? 'title' then p_patch->>'title' else title end,
 company=case when p_patch ? 'company' then p_patch->>'company' else company end,
 priority=case when p_patch ? 'priority' then p_patch->>'priority' else priority end,
 expected_close_at=case when p_patch ? 'expectedCloseAt' then (p_patch->>'expectedCloseAt')::timestamptz else expected_close_at end
 where organization_id=p_organization_id and id=p_id;
 if p_patch ? 'tags' then update public.contacts set tags=array(select jsonb_array_elements_text(p_patch->'tags')) where organization_id=p_organization_id and id=ct; end if;
end $$;
