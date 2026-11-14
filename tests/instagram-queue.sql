-- Apply after 0001..0004 on disposable PostgreSQL. Uses no Meta credentials.
begin;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000041','ig-a@example.invalid'),('00000000-0000-0000-0000-000000000042','ig-b@example.invalid');
insert into public.organizations(id,name) values('00000000-0000-0000-0000-000000000051','IG A'),('00000000-0000-0000-0000-000000000052','IG B');
insert into public.memberships(organization_id,user_id,role) values('00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000041','owner'),('00000000-0000-0000-0000-000000000052','00000000-0000-0000-0000-000000000042','owner');
set local role service_role;
do $$ declare connection uuid; channel uuid; evt jsonb; first_receipt jsonb; retry_receipt jsonb; begin
 connection := public.connect_instagram('00000000-0000-0000-0000-000000000051','ig-account','tester','encrypted-placeholder',now()+interval '60 days','00000000-0000-0000-0000-000000000041');
 select channel_id into channel from public.instagram_connections where id=connection;
 evt := jsonb_build_object('organizationId','00000000-0000-0000-0000-000000000051','channelId',channel,'channelKind','instagram','providerMessageId','ig-inbound','externalContactId','tester-customer','text','Oi','occurredAt',now(),'origin','meta');
 insert into public.instagram_webhook_jobs(organization_id,connection_id,event_key,kind,event) values('00000000-0000-0000-0000-000000000051',connection,'message:ig-inbound','message',evt) on conflict do nothing;
 insert into public.instagram_webhook_jobs(organization_id,connection_id,event_key,kind,event) values('00000000-0000-0000-0000-000000000051',connection,'message:ig-inbound','message',evt) on conflict do nothing;
 if public.process_instagram_jobs() <> 1 then raise exception 'Worker did not process one event'; end if;
 if public.process_instagram_jobs() <> 0 then raise exception 'Duplicate job replayed'; end if;
 if (select count(*) from public.messages where organization_id='00000000-0000-0000-0000-000000000051') <> 1 then raise exception 'Duplicate inbound'; end if;
 first_receipt := public.reserve_instagram_outbound('00000000-0000-0000-0000-000000000051',channel,'outbound-key','hash');
 retry_receipt := public.reserve_instagram_outbound('00000000-0000-0000-0000-000000000051',channel,'outbound-key','hash');
 if first_receipt->>'state' <> 'new' or retry_receipt->>'state' <> 'pending' then raise exception 'Reservation failure'; end if;
 begin
  perform public.reserve_instagram_outbound('00000000-0000-0000-0000-000000000051',channel,'outbound-key','different');
  raise exception 'Payload mismatch accepted';
 exception when raise_exception then if SQLERRM <> 'Idempotency key payload mismatch' then raise; end if; end;
 perform public.complete_instagram_outbound('00000000-0000-0000-0000-000000000051',channel,'outbound-key','ig-outbound','tester-customer','Resposta');
 retry_receipt := public.reserve_instagram_outbound('00000000-0000-0000-0000-000000000051',channel,'outbound-key','hash');
 if retry_receipt->>'state' <> 'sent' or retry_receipt->>'providerMessageId' <> 'ig-outbound' then raise exception 'Sent receipt missing'; end if;
 insert into public.instagram_webhook_jobs(organization_id,connection_id,event_key,kind,event) values('00000000-0000-0000-0000-000000000051',connection,'read:ig-outbound','status',jsonb_build_object('providerMessageId','ig-outbound','status','read','occurredAt',now()));
 perform public.process_instagram_jobs();
 if not exists(select 1 from public.messages where provider_message_id='ig-outbound' and status='read') then raise exception 'Read receipt missing'; end if;
 begin
  insert into public.instagram_webhook_jobs(organization_id,connection_id,event_key,kind,event) values('00000000-0000-0000-0000-000000000052',connection,'forged','message',evt);
  raise exception 'Cross-tenant connection allowed';
 exception when foreign_key_violation then null; end;
 insert into public.instagram_oauth_states(nonce,organization_id,user_id,expires_at) values('nonce-once','00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-000000000041',now()+interval '10 minutes');
 delete from public.instagram_oauth_states where nonce='nonce-once';
 if not found then raise exception 'Nonce not consumed'; end if;
 delete from public.instagram_oauth_states where nonce='nonce-once';
 if found then raise exception 'Nonce replay permitted'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000041',true);
do $$ begin
 begin perform 1 from public.instagram_connections; raise exception 'Credential read allowed'; exception when insufficient_privilege then null; end;
 begin perform public.process_instagram_jobs(); raise exception 'Client worker allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
