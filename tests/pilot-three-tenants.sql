-- Real database integration: 3 tenants, metering, privilege boundaries, monthly reports.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','pilot-a@example.invalid'),
 ('10000000-0000-0000-0000-000000000002','pilot-b@example.invalid'),
 ('10000000-0000-0000-0000-000000000003','pilot-c@example.invalid');
insert into public.organizations(id,name) values
 ('11000000-0000-0000-0000-000000000001','Pilot A'),
 ('11000000-0000-0000-0000-000000000002','Pilot B'),
 ('11000000-0000-0000-0000-000000000003','Pilot C');
insert into public.memberships(organization_id,user_id,role) values
 ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
 ('11000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','owner'),
 ('11000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','owner');
insert into public.tenant_plans(organization_id,monthly_limit,limit_mode) values
 ('11000000-0000-0000-0000-000000000001',1,'hard'),
 ('11000000-0000-0000-0000-000000000002',1,'soft'),
 ('11000000-0000-0000-0000-000000000003',2,'hard');
set local role service_role;
insert into public.usage_events(organization_id,event_key,kind,quantity) values
 ('11000000-0000-0000-0000-000000000001','once','automated_conversation',1),
 ('11000000-0000-0000-0000-000000000002','once','automated_conversation',1),
 ('11000000-0000-0000-0000-000000000002','twice','automated_conversation',1),
 ('11000000-0000-0000-0000-000000000003','once','automated_conversation',1);
insert into public.usage_events(organization_id,event_key,kind,quantity) values ('11000000-0000-0000-0000-000000000001','once','automated_conversation',1) on conflict do nothing;
reset role;
insert into public.usage_events(organization_id,event_key,kind,quantity,created_at) values ('11000000-0000-0000-0000-000000000001','old','automated_conversation',999,date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'-interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$ declare r jsonb; begin
 r:=public.usage_summary('11000000-0000-0000-0000-000000000001');
 if (r->>'automatedConversations')::int<>1 or (r->>'remaining')::int<>0 or (r->>'billingEnabled')::boolean then raise exception 'Invalid A metering report';end if;
 if (select count(*) from public.tenant_plans)<>1 then raise exception 'Plan leak';end if;
 begin perform public.usage_summary('11000000-0000-0000-0000-000000000002');raise exception 'Foreign report accepted';exception when insufficient_privilege then null;end;
 begin delete from public.usage_events;raise exception 'Usage deletion allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$ declare r jsonb; begin
 r:=public.usage_summary('11000000-0000-0000-0000-000000000002');
 if (r->>'automatedConversations')::int<>2 or r->>'mode'<>'soft' then raise exception 'Invalid B metering report';end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$ declare r jsonb; begin
 r:=public.usage_summary('11000000-0000-0000-0000-000000000003');
 if (r->>'automatedConversations')::int<>1 or (r->>'remaining')::int<>1 then raise exception 'Invalid C metering report';end if;
end $$;
rollback;
