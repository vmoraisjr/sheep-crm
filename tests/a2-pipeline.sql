begin;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000051','crm-a@example.invalid'),('00000000-0000-0000-0000-000000000052','crm-b@example.invalid');
insert into public.organizations(id,name) values('00000000-0000-0000-0000-000000000061','CRM A'),('00000000-0000-0000-0000-000000000062','CRM B');
insert into public.memberships(organization_id,user_id,role) values('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000051','owner'),('00000000-0000-0000-0000-000000000062','00000000-0000-0000-0000-000000000052','owner');
insert into public.channels(id,organization_id,kind,external_id,status) values('00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-000000000061','whatsapp','crm-a','simulated');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000051',true);
do $$ declare ct uuid; ct2 uuid; opp uuid; opp2 uuid; count_before integer; begin
 insert into public.contacts(organization_id,channel_id,external_id,name) values('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000071','a2-1','A2 one') returning id into ct;
 insert into public.contacts(organization_id,channel_id,external_id,name) values('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000071','a2-2','A2 two') returning id into ct2;
 select id into strict opp from public.opportunities where contact_id=ct;select id into strict opp2 from public.opportunities where contact_id=ct2;
 insert into public.crm_stage_rules(organization_id,from_stage,to_stage,enabled,task_notes) values('00000000-0000-0000-0000-000000000061','new','qualified',true,'Follow up on qualified lead');
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000061',opp,'qualified',0);
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000061',opp2,'qualified',0);
 if not exists(select 1 from public.opportunities where id=opp and position=1 and jsonb_array_length(movement_history)=1) then raise exception 'Position/history incorrect';end if;
 if (select count(*) from public.crm_tasks where contact_id in (ct,ct2))<>2 then raise exception 'Internal stage tasks missing';end if;
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000061',opp,'qualified',0);
 if (select count(*) from public.crm_tasks where contact_id in (ct,ct2))<>2 then raise exception 'Reorder duplicated tasks';end if;
 update public.opportunities set movement_history='[]' where id=opp;
 if not exists(select 1 from public.opportunities where id=opp and jsonb_array_length(movement_history)=1) then raise exception 'Audit history could be forged';end if;
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000061',opp,'proposal',0);
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000061',opp,'negotiation',0);
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000061',opp,'won',0);
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000061',opp,'new',0);
 if not exists(select 1 from public.opportunities where id=opp and jsonb_array_length(movement_history)=5) then raise exception 'Transitions not audited';end if;
 begin
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000062',opp,'won',0);
 raise exception 'Cross tenant move accepted';exception when raise_exception then if SQLERRM<>'Tenant access denied' then raise;end if;end;
 begin
 perform public.move_crm_opportunity('00000000-0000-0000-0000-000000000061',opp,'invalid',0);
 raise exception 'Invalid move accepted';exception when raise_exception then if SQLERRM<>'Invalid destination' then raise;end if;end;
end $$;
rollback;
