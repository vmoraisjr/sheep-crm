-- Authentication is managed by Supabase Auth. Never expose service_role to a client.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);
create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create index memberships_user_idx on public.memberships(user_id);
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
create function public.is_org_member(org_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.memberships where organization_id=org_id and user_id=(select auth.uid())); $$;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
create policy org_read on public.organizations for select to authenticated using (public.is_org_member(id));
create policy membership_read on public.memberships for select to authenticated using (public.is_org_member(organization_id));
-- Provision membership atomically. No direct insert/update grants: clients cannot escalate roles.
create function public.create_organization(organization_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare org_id uuid; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if char_length(trim(organization_name)) not between 2 and 120 then raise exception 'Invalid organization name'; end if;
  -- Bound self-provisioning abuse while allowing three-company pilots.
  perform pg_advisory_xact_lock(hashtext(caller::text));
  if (select count(*) from public.memberships where user_id=caller and role='owner') >= 3 then raise exception 'Organization limit reached'; end if;
  insert into public.organizations(name) values(trim(organization_name)) returning id into org_id;
  insert into public.memberships(organization_id,user_id,role) values(org_id,caller,'owner');
  return org_id;
end; $$;
revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;
revoke all on public.organizations, public.memberships from anon, authenticated;
grant select on public.organizations, public.memberships to authenticated;
