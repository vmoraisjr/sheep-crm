-- Runtime configuration must be provisioned server-side after validating tenant ownership.
create table public.whatsapp_connections (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null,
  phone_number_id text primary key,
  encrypted_access_token text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, channel_id),
  foreign key (organization_id,channel_id) references public.channels(organization_id,id) on delete cascade
);
alter table public.whatsapp_connections enable row level security;
-- No user policy: encrypted secrets are service-role-only.
revoke all on public.whatsapp_connections from anon, authenticated;
create table public.whatsapp_webhook_jobs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null,
  event_key text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, channel_id, event_key),
  foreign key (organization_id,channel_id) references public.channels(organization_id,id) on delete cascade
);
alter table public.whatsapp_webhook_jobs enable row level security;
revoke all on public.whatsapp_webhook_jobs from anon, authenticated;
create index whatsapp_jobs_pending on public.whatsapp_webhook_jobs(available_at) where status in ('pending','processing');
create function public.enqueue_whatsapp_events(events jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare event jsonb; connection public.whatsapp_connections;
begin
  for event in select value from jsonb_array_elements(events) loop
    select * into connection from public.whatsapp_connections where phone_number_id = event->>'phoneNumberId';
    if not found then raise exception 'Unknown WhatsApp connection'; end if;
    insert into public.whatsapp_webhook_jobs(organization_id,channel_id,event_key,payload)
    values(connection.organization_id,connection.channel_id,event->>'eventKey',event->'payload') on conflict do nothing;
  end loop;
end; $$;
revoke all on function public.enqueue_whatsapp_events(jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_whatsapp_events(jsonb) to service_role;
create function public.claim_whatsapp_jobs(batch_size integer default 20) returns setof public.whatsapp_webhook_jobs language sql security definer set search_path = '' as $$
  update public.whatsapp_webhook_jobs set status='processing', attempts=attempts+1, claimed_at=now()
  where id in (select id from public.whatsapp_webhook_jobs where attempts < 8 and available_at <= now()
    and (status='pending' or (status='processing' and claimed_at < now()-interval '5 minutes'))
    order by id for update skip locked limit least(greatest(batch_size,1),100)) returning *;
$$;
revoke all on function public.claim_whatsapp_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_jobs(integer) to service_role;
-- Status webhooks may arrive out of order. Never regress read/delivered to sent.
create function public.update_whatsapp_message_status(tenant_id uuid, channel uuid, provider_id text, next_status text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if next_status not in ('sent','delivered','read','failed') then raise exception 'Invalid status'; end if;
  update public.messages set status=next_status
  where organization_id=tenant_id and channel_id=channel and provider_message_id=provider_id
    and direction='outbound'
    and case next_status
      when 'read' then status <> 'read'
      when 'delivered' then status not in ('read','delivered')
      when 'sent' then status in ('pending','received')
      when 'failed' then status in ('pending','sent') else false end;
  -- If status races the outbound insert, keep the queue job retryable.
  if not exists(select 1 from public.messages where organization_id=tenant_id and channel_id=channel and provider_message_id=provider_id and direction='outbound') then
    raise exception 'Outbound message not persisted yet';
  end if;
end; $$;
revoke all on function public.update_whatsapp_message_status(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.update_whatsapp_message_status(uuid,uuid,text,text) to service_role;
-- Explicit grants also support clean PostgreSQL harnesses without Supabase default ACLs.
grant select,insert,update,delete on public.whatsapp_connections, public.whatsapp_webhook_jobs to service_role;
grant usage,select on sequence public.whatsapp_webhook_jobs_id_seq to service_role;
