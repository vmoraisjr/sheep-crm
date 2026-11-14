create table public.onboarding_profiles (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 draft jsonb not null default '{}'::jsonb,
 revision integer not null default 1,
 approved_revision integer,
 approved_at timestamptz,
 agent_enabled boolean not null default false,
 whatsapp_state text not null default 'disconnected' check (whatsapp_state in ('disconnected','pending_permissions','connected')),
 instagram_state text not null default 'disconnected' check (instagram_state in ('disconnected','pending_permissions','connected')),
 check (not agent_enabled or (approved_revision = revision and approved_at is not null))
);
alter table public.onboarding_profiles enable row level security;
create policy onboarding_read on public.onboarding_profiles for select to authenticated using (public.is_org_member(organization_id));
-- Writes go through security-definer RPC; channel status is never accepted from the browser.
create function public.save_onboarding(p_organization_id uuid,p_draft jsonb,p_expected_revision integer)
returns public.onboarding_profiles language plpgsql security definer set search_path=public as $$
declare result public.onboarding_profiles;
begin
 if not exists(select 1 from memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Forbidden' using errcode='42501'; end if;
 insert into onboarding_profiles(organization_id,draft) values(p_organization_id,p_draft)
 on conflict(organization_id) do update set draft=excluded.draft,revision=onboarding_profiles.revision+1,approved_revision=null,approved_at=null,agent_enabled=false
 where onboarding_profiles.revision=p_expected_revision returning * into result;
 if result.organization_id is null then raise exception 'Revision conflict' using errcode='40001'; end if;
 return result;
end $$;
create function public.approve_onboarding(p_organization_id uuid,p_expected_revision integer)
returns public.onboarding_profiles language plpgsql security definer set search_path=public as $$
declare result public.onboarding_profiles;
begin
 if not exists(select 1 from memberships where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Forbidden' using errcode='42501'; end if;
 update onboarding_profiles set approved_revision=revision,approved_at=now(),agent_enabled=true
 where organization_id=p_organization_id and revision=p_expected_revision
 and length(trim(draft->>'companyName'))>0 and length(trim(draft->>'faq'))>0 and length(trim(draft->>'rules'))>0 returning * into result;
 if result.organization_id is null then raise exception 'Revision conflict or incomplete content'; end if;
 return result;
end $$;
revoke all on function public.save_onboarding(uuid,jsonb,integer) from public,anon;
revoke all on function public.approve_onboarding(uuid,integer) from public,anon;
grant execute on function public.save_onboarding(uuid,jsonb,integer),public.approve_onboarding(uuid,integer) to authenticated;
grant select on public.onboarding_profiles to authenticated;
grant all on public.onboarding_profiles to service_role;
