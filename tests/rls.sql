-- Run with psql against a disposable local Supabase DB after applying migrations.
-- A real SQL integration test: transaction is always rolled back.
begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','a@example.invalid'),('00000000-0000-0000-0000-000000000002','b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.create_organization('Empresa A');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select public.create_organization('Empresa B');
do $$ begin
 if (select count(*) from public.organizations) <> 1 then raise exception 'Tenant leak'; end if;
 if (select name from public.organizations) <> 'Empresa B' then raise exception 'Wrong tenant visible'; end if;
 if (select count(*) from public.memberships) <> 1 then raise exception 'Membership leak'; end if;
 begin
  update public.memberships set role='owner';
  raise exception 'Escalation allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
