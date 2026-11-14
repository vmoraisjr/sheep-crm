-- Credentials, nonces and jobs are server-only. RLS intentionally has no client policies.
create table public.instagram_oauth_states (
  nonce text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
create table public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid,
  account_id text not null,
  username text not null,
  encrypted_token text not null,
  expires_at timestamptz not null,
  status text not null check (status in ('connected','disconnected','pending_permissions','reconnect_required')),
  connected_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id,account_id),
  unique (organization_id,id)
);
create table public.instagram_webhook_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  event_key text not null,
  kind text not null check (kind in ('message','status')),
  event jsonb not null,
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (organization_id,connection_id) references public.instagram_connections(organization_id,id) on delete cascade,
  unique (connection_id,event_key)
);
alter table public.instagram_oauth_states enable row level security;
alter table public.instagram_connections enable row level security;
alter table public.instagram_webhook_jobs enable row level security;
revoke all on public.instagram_oauth_states, public.instagram_connections, public.instagram_webhook_jobs from anon, authenticated;
grant all on public.instagram_oauth_states, public.instagram_connections, public.instagram_webhook_jobs to service_role;
create index instagram_jobs_due on public.instagram_webhook_jobs (available_at) where status in ('queued','failed');
alter table public.instagram_connections add foreign key(organization_id,channel_id) references public.channels(organization_id,id);
-- Provisioning is atomic and service-only; account cannot silently move between tenants.
create unique index instagram_unique_account on public.instagram_connections(account_id);
create function public.connect_instagram(p_organization_id uuid, p_account_id text, p_username text, p_encrypted_token text, p_expires_at timestamptz, p_user_id uuid) returns uuid language plpgsql security invoker set search_path=public as $$
declare channel uuid; connection uuid;
begin
 if not exists(select 1 from public.memberships where organization_id=p_organization_id and user_id=p_user_id and role in ('owner','admin')) then raise exception 'Administrator required'; end if;
 insert into public.channels(organization_id,kind,external_id,status) values(p_organization_id,'instagram',p_account_id,'connected')
 on conflict(organization_id,kind,external_id) do update set status='connected' returning id into channel;
 insert into public.instagram_connections(organization_id,channel_id,account_id,username,encrypted_token,expires_at,status,connected_by)
 values(p_organization_id,channel,p_account_id,p_username,p_encrypted_token,p_expires_at,'connected',p_user_id)
 on conflict(organization_id,account_id) do update set channel_id=excluded.channel_id,username=excluded.username,encrypted_token=excluded.encrypted_token,expires_at=excluded.expires_at,status='connected',connected_by=excluded.connected_by returning id into connection;
 return connection;
end $$;
revoke all on function public.connect_instagram(uuid,text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.connect_instagram(uuid,text,text,text,timestamptz,uuid) to service_role;
-- Run from a trusted worker. All ingestion + completion happens within this transaction.
create function public.process_instagram_jobs(p_limit integer default 50) returns integer language plpgsql security invoker set search_path=public as $$
declare job public.instagram_webhook_jobs; connection public.instagram_connections; processed integer := 0;
begin
 for job in select * from public.instagram_webhook_jobs where status in ('queued','failed') and attempts < 5 and available_at <= now() order by created_at for update skip locked limit least(greatest(p_limit,1),100) loop
  begin
   select * into strict connection from public.instagram_connections where id=job.connection_id and organization_id=job.organization_id and status='connected';
   if job.kind='message' then
    if job.event->>'organizationId' <> job.organization_id::text or job.event->>'channelId' <> connection.channel_id::text then raise exception 'Queue routing mismatch'; end if;
    perform public.ingest_inbound(job.event);
   else
    update public.messages set status='read' where organization_id=job.organization_id and channel_id=connection.channel_id and provider_message_id=job.event->>'providerMessageId' and direction='outbound' and status in ('sent','delivered');
   end if;
   update public.instagram_webhook_jobs set status='done', attempts=attempts+1 where id=job.id;
   processed := processed+1;
  exception when others then
   update public.instagram_webhook_jobs set status='failed', attempts=attempts+1, available_at=now()+interval '1 minute' * power(2,least(attempts,5)) where id=job.id;
  end;
 end loop;
 return processed;
end $$;
revoke all on function public.process_instagram_jobs(integer) from public,anon,authenticated;
grant execute on function public.process_instagram_jobs(integer) to service_role;
create table public.instagram_outbound_receipts (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 channel_id uuid not null, idempotency_key text not null, payload_hash text not null,
 provider_message_id text, created_at timestamptz not null default now(),
 primary key(organization_id,channel_id,idempotency_key),
 foreign key(organization_id,channel_id) references public.channels(organization_id,id) on delete cascade
);
alter table public.instagram_outbound_receipts enable row level security;
revoke all on public.instagram_outbound_receipts from anon,authenticated;
grant all on public.instagram_outbound_receipts to service_role;
create function public.reserve_instagram_outbound(p_org uuid,p_channel uuid,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare receipt public.instagram_outbound_receipts; inserted boolean;
begin
 insert into public.instagram_outbound_receipts(organization_id,channel_id,idempotency_key,payload_hash) values(p_org,p_channel,p_key,p_hash) on conflict do nothing;
 inserted := found;
 select * into strict receipt from public.instagram_outbound_receipts where organization_id=p_org and channel_id=p_channel and idempotency_key=p_key;
 if receipt.payload_hash <> p_hash then raise exception 'Idempotency key payload mismatch'; end if;
 return jsonb_build_object('state',case when inserted then 'new' when receipt.provider_message_id is not null then 'sent' else 'pending' end,'providerMessageId',receipt.provider_message_id);
end $$;
create function public.complete_instagram_outbound(p_org uuid,p_channel uuid,p_key text,p_provider text,p_recipient text,p_text text) returns void language plpgsql security invoker set search_path=public as $$
declare conv public.conversations;
begin
 select conversations.* into strict conv from public.conversations join public.contacts on contacts.id=conversations.contact_id and contacts.organization_id=conversations.organization_id where conversations.organization_id=p_org and conversations.channel_id=p_channel and contacts.external_id=p_recipient;
 update public.instagram_outbound_receipts set provider_message_id=p_provider where organization_id=p_org and channel_id=p_channel and idempotency_key=p_key and provider_message_id is null;
 if not found then raise exception 'Missing outbound reservation'; end if;
 insert into public.messages(organization_id,conversation_id,channel_id,provider_message_id,direction,text,occurred_at,origin,status) values(p_org,conv.id,p_channel,p_provider,'outbound',p_text,now(),'meta','sent');
 update public.conversations set unanswered=false where id=conv.id and organization_id=p_org;
end $$;
revoke all on function public.reserve_instagram_outbound(uuid,uuid,text,text),public.complete_instagram_outbound(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_instagram_outbound(uuid,uuid,text,text),public.complete_instagram_outbound(uuid,uuid,text,text,text,text) to service_role;
