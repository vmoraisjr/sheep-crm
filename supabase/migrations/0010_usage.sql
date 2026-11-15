-- Owner/admin can choose a cap; only server-side workers can write metered usage.
create table public.tenant_plans (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 monthly_limit integer not null default 1000 check(monthly_limit>=0),
 limit_mode text not null default 'hard' check(limit_mode in ('soft','hard')),
 updated_at timestamptz not null default now()
);
alter table public.tenant_plans enable row level security;
create policy plan_read on public.tenant_plans for select to authenticated using(public.is_org_member(organization_id));
create policy plan_manage on public.tenant_plans for all to authenticated using(exists(select 1 from public.memberships where organization_id=tenant_plans.organization_id and user_id=auth.uid() and role in ('owner','admin'))) with check(exists(select 1 from public.memberships where organization_id=tenant_plans.organization_id and user_id=auth.uid() and role in ('owner','admin')));
grant select,insert,update on public.tenant_plans to authenticated;
create function public.usage_summary(p_org uuid) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; plan_limit integer:=1000; mode text:='hard'; automated bigint; msgs bigint; tokens bigint; cost bigint;
begin
 if not public.is_org_member(p_org) then raise exception 'Forbidden' using errcode='42501'; end if;
 select monthly_limit,limit_mode into plan_limit,mode from public.tenant_plans where organization_id=p_org;
 plan_limit:=coalesce(plan_limit,1000); mode:=coalesce(mode,'hard');
 select coalesce(sum(quantity) filter(where kind='automated_conversation'),0),coalesce(sum(quantity) filter(where kind='message'),0),coalesce(sum(quantity) filter(where kind='tokens'),0),coalesce(sum(cost_micros),0) into automated,msgs,tokens,cost
 from public.usage_events where organization_id=p_org and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
 result:=jsonb_build_object('organizationId',p_org,'period',to_char(now() at time zone 'UTC','YYYY-MM'),'automatedConversations',automated,'messages',msgs,'tokens',tokens,'costMicros',cost,'limit',plan_limit,'mode',mode,'exceeded',automated>=plan_limit,'remaining',greatest(0,plan_limit-automated),'billingEnabled',false);
 return result;
end $$;
revoke all on function public.usage_summary(uuid) from public,anon;
grant execute on function public.usage_summary(uuid) to authenticated;
grant all on public.tenant_plans to service_role;
-- Aggregate on the database to avoid PostgREST row limits and serialize the final cap check.
create function public.automation_budget(p_org uuid,p_conversation uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'usedReplies',coalesce((select sum(quantity) from usage_events where organization_id=p_org and kind='automated_conversation' and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0),
 'usedTokens',coalesce((select sum(quantity) from usage_events where organization_id=p_org and kind='tokens' and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0),
 'existingMeter',exists(select 1 from usage_events where organization_id=p_org and event_key in ('automated:'||p_conversation,'automated:'||to_char(now() at time zone 'UTC','YYYY-MM')||':'||p_conversation) and created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),
 'monthlyLimit',coalesce((select monthly_limit from tenant_plans where organization_id=p_org),1000),
 'mode',coalesce((select limit_mode from tenant_plans where organization_id=p_org),'hard'),
 'repliesThisHour',(select count(*) from automation_decisions where organization_id=p_org and status='committed' and decision->>'action'='reply' and claimed_at>now()-interval '1 hour'));
$$;
revoke all on function public.automation_budget(uuid,uuid) from public,anon,authenticated;
grant execute on function public.automation_budget(uuid,uuid) to service_role;
create function public.pending_automation_messages() returns table(organization_id uuid,conversation_id uuid,message_id uuid) language sql security invoker set search_path=public as $$
 select m.organization_id,m.conversation_id,m.id from messages m
 join channels ch on ch.organization_id=m.organization_id and ch.id=m.channel_id and ch.status='connected'
 left join automation_decisions d on d.organization_id=m.organization_id and d.message_id=m.id
 where m.direction='inbound' and m.origin='meta' and (d.message_id is null or d.status='failed' or (d.status='claimed' and d.claimed_at<now()-interval '5 minutes'))
 order by m.created_at limit 50;
$$;
revoke all on function public.pending_automation_messages() from public,anon,authenticated;
grant execute on function public.pending_automation_messages() to service_role;

create or replace function public.commit_automation(p_org uuid,p_message uuid,p_decision jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.conversations; ct public.contacts; cfg jsonb; profile_approved boolean := false; used bigint; hour_replies bigint; d jsonb:=p_decision; msg public.messages; budget jsonb; already_metered boolean;
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
 budget:=public.automation_budget(p_org,c.id);
 used:=(budget->>'usedReplies')::bigint; already_metered:=(budget->>'existingMeter')::boolean;
 if d->>'action'='reply' and budget->>'mode'='hard' and not already_metered and used>=(budget->>'monthlyLimit')::integer then
 d:=jsonb_build_object('action','handoff','reason','limit','provider','deterministic','tokens',0,'costMicros',0);
 end if;
 select count(*) into hour_replies from public.automation_decisions where organization_id=p_org and status='committed' and decision->>'action'='reply' and claimed_at>now()-interval '1 hour';
 if d->>'action'='reply' and (c.last_inbound_at>msg.occurred_at or c.ai_paused or ct.opted_out or not ct.opted_in or cfg is null or not coalesce(profile_approved,false) or hour_replies>=coalesce((cfg->>'maxRepliesPerHour')::integer,0)) then
 d=jsonb_build_object('action','skip','reason','human_priority','provider','deterministic','tokens',0,'costMicros',0);
 end if;
 if d->>'action'='reply' then
 insert into public.automation_outbox(organization_id,conversation_id,message_id,text) values(p_org,c.id,p_message,d->>'text') on conflict do nothing;
 insert into public.usage_events(organization_id,event_key,kind,quantity,cost_micros) select p_org,'automated:'||to_char(now() at time zone 'UTC','YYYY-MM')||':'||c.id,'automated_conversation',1,0 where not already_metered on conflict do nothing;
 elsif d->>'action'='handoff' then
 update public.conversations set ai_paused=true where organization_id=p_org and id=c.id;
 insert into public.handoffs(organization_id,conversation_id,reason,context) values(p_org,c.id,d->>'reason',left(msg.text,2000));
 end if;
 update public.automation_decisions set status='committed',decision=d where organization_id=p_org and message_id=p_message;
 return d;
end $$;
