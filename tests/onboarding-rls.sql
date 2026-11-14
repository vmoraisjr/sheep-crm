begin;
insert into auth.users(id,email) values ('90000000-0000-0000-0000-000000000001','onboard-a@example.invalid'),('90000000-0000-0000-0000-000000000002','onboard-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
select public.create_organization('Onboarding A');
select public.save_onboarding((select id from public.organizations),'{"companyName":"A","faq":"Q: Horário?\nA: 9h","rules":"Transferir desconhecidos"}',0);
select public.approve_onboarding((select id from public.organizations),1);
do $$ begin
 if not (select agent_enabled from public.onboarding_profiles) then raise exception 'Approval missing';end if;
 begin
 perform public.approve_onboarding((select id from public.organizations),0);
 raise exception 'Stale approval accepted';
 exception when raise_exception then if sqlerrm='Stale approval accepted' then raise;end if;end;
end $$;
select public.save_onboarding((select id from public.organizations),'{"companyName":"A","faq":"Q: Horário?\nA: 10h","rules":"Transferir"}',1);
do $$ begin
 if (select agent_enabled from public.onboarding_profiles) then raise exception 'Edit retained approval';end if;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000002',true);
select public.create_organization('Onboarding B');
do $$ begin
 if (select count(*) from public.onboarding_profiles)<>0 then raise exception 'Cross tenant onboarding leak';end if;
 begin
 perform public.approve_onboarding((select organization_id from public.memberships where user_id='90000000-0000-0000-0000-000000000001'),1);
 raise exception 'Foreign approval accepted';
 exception when insufficient_privilege then null;end;
end $$;
rollback;
