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
