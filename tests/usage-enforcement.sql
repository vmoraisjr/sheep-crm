begin;
insert into public.organizations(id,name) values ('12000000-0000-0000-0000-000000000001','Cap hard'),('12000000-0000-0000-0000-000000000002','Cap soft');
insert into public.channels(id,organization_id,kind,external_id,status) values ('13000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','whatsapp','cap-hard','simulated'),('13000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000002','instagram','cap-soft','simulated');
insert into public.tenant_plans(organization_id,monthly_limit,limit_mode) values ('12000000-0000-0000-0000-000000000001',1,'hard'),('12000000-0000-0000-0000-000000000002',0,'soft');
set local role service_role;
insert into public.onboarding_profiles(organization_id,draft,revision,approved_revision,approved_at,agent_enabled) values
 ('12000000-0000-0000-0000-000000000001','{"companyName":"A","faq":"Q: Oi\nA: Olá","rules":"Humano"}',1,1,now(),true),
 ('12000000-0000-0000-0000-000000000002','{"companyName":"B","faq":"Q: Oi\nA: Olá","rules":"Humano"}',1,1,now(),true);
insert into public.automation_settings(organization_id,config) values ('12000000-0000-0000-0000-000000000001','{"maxRepliesPerHour":100}'),('12000000-0000-0000-0000-000000000002','{"maxRepliesPerHour":100}');
do $$ declare org uuid; chan uuid; receipt jsonb; msg uuid; conv uuid; result jsonb; budget jsonb; i integer; begin
 for i in 1..4 loop
 org:=case when i=4 then '12000000-0000-0000-0000-000000000002'::uuid else '12000000-0000-0000-0000-000000000001'::uuid end;
 chan:=case when i=4 then '13000000-0000-0000-0000-000000000002'::uuid else '13000000-0000-0000-0000-000000000001'::uuid end;
 receipt:=public.ingest_inbound(jsonb_build_object('organizationId',org,'channelId',chan,'channelKind',case when i=4 then 'instagram' else 'whatsapp' end,'providerMessageId','cap-'||i,'externalContactId',case when i=3 then 'contact-1' else 'contact-'||i end,'text','Oi','occurredAt',now(),'origin','simulated'));
 msg:=(receipt->'message'->>'id')::uuid;conv:=(receipt->'conversation'->>'id')::uuid;
 update public.contacts set opted_in=true where organization_id=org;
 update public.conversations set ai_paused=false where organization_id=org and id=conv;
 if not public.claim_automation(org,msg) then raise exception 'Missing claim';end if;
 result:=public.commit_automation(org,msg,'{"action":"reply","reason":"approved_faq","text":"Olá","tokens":0,"costMicros":0,"provider":"deterministic"}');
 if i=2 then
  if result->>'action'<>'handoff' or result->>'reason'<>'limit' then raise exception 'Hard cap failed: %',result;end if;
 else
  if result->>'action'<>'reply' then raise exception 'Allowed reply blocked: %',result;end if;
 end if;
 end loop;
 if (select count(*) from public.usage_events where organization_id='12000000-0000-0000-0000-000000000001' and kind='automated_conversation')<>1 then raise exception 'Conversation billed twice';end if;
 if (select count(*) from public.usage_events where organization_id='12000000-0000-0000-0000-000000000002' and kind='automated_conversation')<>1 then raise exception 'Soft cap blocked';end if;
 budget:=public.automation_budget(org,conv);
 if (budget->>'usedReplies')::int<>1 or budget->>'mode'<>'soft' then raise exception 'Budget aggregate wrong';end if;
end $$;
rollback;
