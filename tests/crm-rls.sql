begin;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000051','crm-a@example.invalid'),('00000000-0000-0000-0000-000000000052','crm-b@example.invalid');
insert into public.organizations(id,name) values('00000000-0000-0000-0000-000000000061','CRM A'),('00000000-0000-0000-0000-000000000062','CRM B');
insert into public.memberships(organization_id,user_id,role) values('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000051','owner'),('00000000-0000-0000-0000-000000000062','00000000-0000-0000-0000-000000000052','owner');
insert into public.channels(id,organization_id,kind,external_id,status) values('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000061','whatsapp','crm-a','simulated');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000051',true);
do $$ declare contact uuid; opp uuid; begin
 insert into public.contacts(organization_id,channel_id,external_id,name) values('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000071','crm-sender','CRM contact') returning id into contact;
 select id into strict opp from public.opportunities where contact_id=contact;
 perform public.update_crm_opportunity('00000000-0000-0000-0000-000000000061',opp,'{"stage":"won","assignee":"self","nextAction":"Contrato","valueCents":12000,"tags":["Cliente"]}');
 if not exists(select 1 from public.opportunities where id=opp and stage='won' and value_cents=12000 and assignee=auth.uid()) then raise exception 'CRM update failed'; end if;
 if not exists(select 1 from public.contacts where id=contact and tags=array['Cliente']) then raise exception 'Tags not shared with contact'; end if;
 begin
 perform public.update_crm_opportunity('00000000-0000-0000-0000-000000000062',opp,'{"stage":"lost"}');
 raise exception 'Cross tenant CRM write allowed';
 exception when raise_exception then if SQLERRM <> 'Tenant access denied' then raise; end if; end;
 begin
 insert into public.opportunities(organization_id,contact_id) values('00000000-0000-0000-0000-000000000061',contact);
 raise exception 'Duplicate opportunity allowed';
 exception when unique_violation then null; end;
 begin
 perform 1 from public.manual_reply_requests;
 raise exception 'Client could access reply ledger';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
