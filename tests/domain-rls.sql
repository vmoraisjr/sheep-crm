-- Disposable PostgreSQL with tests/postgres-bootstrap.sql + migrations 0001/0002.
begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000011','domain-a@example.invalid'),('00000000-0000-0000-0000-000000000012','domain-b@example.invalid');
insert into public.organizations(id,name) values('00000000-0000-0000-0000-000000000021','Domain A'),('00000000-0000-0000-0000-000000000022','Domain B');
insert into public.memberships(organization_id,user_id,role) values('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011','owner'),('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000012','owner');
insert into public.channels(id,organization_id,kind,external_id,status) values('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000021','whatsapp','phone-a','simulated'),('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000022','instagram','ig-b','simulated');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
do $$ declare e jsonb; first_result jsonb; retry_result jsonb; conv uuid; ct uuid; opp uuid; begin
 e := jsonb_build_object('organizationId','00000000-0000-0000-0000-000000000021','channelId','00000000-0000-0000-0000-000000000031','channelKind','whatsapp','providerMessageId','wa-1','externalContactId','sender','text','Olá','occurredAt','2026-11-14T10:00:00Z','origin','simulated');
 begin
  perform public.ingest_inbound(e || '{"origin":"meta"}');
  raise exception 'Forged provider origin allowed';
 exception when insufficient_privilege then null; end;
 first_result := public.ingest_inbound(e);
 retry_result := public.ingest_inbound(e);
 if (first_result->>'duplicate')::boolean or not (retry_result->>'duplicate')::boolean then raise exception 'Wrong retry receipt'; end if;
 if (select count(*) from public.messages) <> 1 or (select count(*) from public.contacts) <> 1 or (select count(*) from public.leads) <> 1 then raise exception 'Duplicate ingestion'; end if;
 conv := (first_result->'conversation'->>'id')::uuid; ct := (first_result->'contact'->>'id')::uuid;
 insert into public.opportunities(organization_id,contact_id) values('00000000-0000-0000-0000-000000000021',ct) returning id into opp;
 insert into public.followups(organization_id,conversation_id,opportunity_id,due_at,idempotency_key) values('00000000-0000-0000-0000-000000000021',conv,opp,now(),'reminder-1');
 perform public.ingest_inbound(e || '{"providerMessageId":"wa-2"}');
 if exists(select 1 from public.followups where status <> 'cancelled') then raise exception 'Followup not cancelled'; end if;
 begin
  perform public.ingest_inbound(e || '{"organizationId":"00000000-0000-0000-0000-000000000022","channelId":"00000000-0000-0000-0000-000000000032","channelKind":"instagram"}');
  raise exception 'Cross-tenant ingest allowed';
 exception when no_data_found then null; end;
 begin
  insert into public.messages(organization_id,conversation_id,channel_id,provider_message_id,direction,occurred_at,origin,status) values('00000000-0000-0000-0000-000000000021',conv,'00000000-0000-0000-0000-000000000032','bad','inbound',now(),'simulated','received');
  raise exception 'Cross-tenant channel reference allowed';
 exception when foreign_key_violation then null; end;
 begin
  insert into public.usage_events(organization_id,event_key,kind,quantity) values('00000000-0000-0000-0000-000000000021','forged','tokens',1);
  raise exception 'Usage forgery allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.channels set status='connected';
  raise exception 'Forged connection allowed';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.channels) <> 1 then raise exception 'Channel tenant leak'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',true);
do $$ begin
 if exists(select 1 from public.messages) or exists(select 1 from public.contacts) or exists(select 1 from public.followups) then raise exception 'Domain tenant leak'; end if;
end $$;
rollback;
