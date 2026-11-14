-- Run after migrations 0001/0002/0003 against disposable PostgreSQL.
begin;
insert into public.organizations(id,name) values('10000000-0000-0000-0000-000000000001','WhatsApp A'),('10000000-0000-0000-0000-000000000002','WhatsApp B');
insert into public.channels(id,organization_id,kind,external_id,status) values('10000000-0000-0000-0000-000000000011','10000000-0000-0000-0000-000000000001','whatsapp','123','connected');
insert into public.whatsapp_connections(organization_id,channel_id,phone_number_id,encrypted_access_token) values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000011','123','test-encrypted');
do $$ begin
  begin
    insert into public.whatsapp_connections(organization_id,channel_id,phone_number_id,encrypted_access_token) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000011','456','test-encrypted');
    raise exception 'Cross tenant connection accepted';
  exception when foreign_key_violation then null; end;
end $$;
select public.enqueue_whatsapp_events('[{"phoneNumberId":"123","eventKey":"message:one","payload":{"message":{"id":"one"}}}]');
select public.enqueue_whatsapp_events('[{"phoneNumberId":"123","eventKey":"message:one","payload":{"message":{"id":"one"}}}]');
do $$ declare n integer; begin
  if (select count(*) from public.whatsapp_webhook_jobs) <> 1 then raise exception 'Queue duplicated provider message'; end if;
  if exists(select 1 from public.whatsapp_webhook_jobs where organization_id <> '10000000-0000-0000-0000-000000000001') then raise exception 'Wrong tenant route'; end if;
  select count(*) into n from public.claim_whatsapp_jobs(); if n<>1 then raise exception 'Claim failed'; end if;
  select count(*) into n from public.claim_whatsapp_jobs(); if n<>0 then raise exception 'Live lease reclaimed'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin perform public.enqueue_whatsapp_events('[]'); raise exception 'Authenticated caller can enqueue'; exception when insufficient_privilege then null; end;
 begin perform * from public.whatsapp_connections; raise exception 'Secrets exposed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
