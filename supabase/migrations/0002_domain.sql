-- Domain boundaries use composite foreign keys: a valid ID from another tenant is never accepted.
create table public.channels (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null check(kind in ('whatsapp','instagram')), external_id text not null,
 status text not null default 'disconnected' check(status in ('disconnected','pending_permissions','simulated','connected')),
 created_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,kind,external_id)
);
create table public.contacts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 channel_id uuid not null, external_id text not null, name text not null, opted_in boolean not null default false,
 opted_out boolean not null default false, tags text[] not null default '{}', created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,channel_id,external_id),
 foreign key(organization_id,channel_id) references public.channels(organization_id,id) on delete cascade
);
create table public.leads (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 contact_id uuid not null, source text not null check(source in ('whatsapp','instagram')), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,contact_id), foreign key(organization_id,contact_id) references public.contacts(organization_id,id) on delete cascade
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 contact_id uuid not null, channel_id uuid not null, channel_kind text not null check(channel_kind in ('whatsapp','instagram')),
 ai_paused boolean not null default true, assigned_to uuid, last_inbound_at timestamptz not null,
 unanswered boolean not null default true, created_at timestamptz not null default now(), unique(organization_id,id), unique(organization_id,channel_id,contact_id),
 foreign key(organization_id,contact_id) references public.contacts(organization_id,id) on delete cascade,
 foreign key(organization_id,channel_id) references public.channels(organization_id,id) on delete cascade,
 foreign key(organization_id,assigned_to) references public.memberships(organization_id,user_id)
);
create table public.messages (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 conversation_id uuid not null, channel_id uuid not null, provider_message_id text not null,
 direction text not null check(direction in ('inbound','outbound')), text text not null default '', media jsonb,
 occurred_at timestamptz not null, origin text not null check(origin in ('meta','simulated')),
 status text not null check(status in ('received','pending','sent','delivered','read','failed')), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,channel_id,provider_message_id),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade,
 foreign key(organization_id,channel_id) references public.channels(organization_id,id) on delete cascade
);
create table public.opportunities (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 contact_id uuid not null, stage text not null default 'new' check(stage in ('new','qualified','negotiation','won','lost')),
 assignee uuid, next_action text not null default '', value_cents bigint check(value_cents >= 0), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,contact_id), foreign key(organization_id,contact_id) references public.contacts(organization_id,id) on delete cascade,
 foreign key(organization_id,assignee) references public.memberships(organization_id,user_id)
);
create table public.followups (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 conversation_id uuid not null, opportunity_id uuid not null, due_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','claimed','sent','cancelled','failed')),
 idempotency_key text not null, attempts integer not null default 0 check(attempts >= 0), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,idempotency_key),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade,
 foreign key(organization_id,opportunity_id) references public.opportunities(organization_id,id) on delete cascade
);
create table public.handoffs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 conversation_id uuid not null, reason text not null, assigned_to uuid, context text not null default '', created_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade,
 foreign key(organization_id,assigned_to) references public.memberships(organization_id,user_id)
);
create table public.automation_rules (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null check(kind in ('greeting','hours','followup','pause','handoff')), enabled boolean not null default false,
 configuration jsonb not null default '{}', created_at timestamptz not null default now(), unique(organization_id,id)
);
create table public.knowledge_sources (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null, content text not null, approved_at timestamptz, approved_by uuid, created_at timestamptz not null default now(), unique(organization_id,id),
 check((approved_at is null) = (approved_by is null)), foreign key(organization_id,approved_by) references public.memberships(organization_id,user_id)
);
create table public.usage_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 event_key text not null, kind text not null check(kind in ('automated_conversation','message','tokens')),
 quantity integer not null check(quantity >= 0), cost_micros bigint not null default 0 check(cost_micros >= 0), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,event_key)
);
do $$ declare t text; begin
 foreach t in array array['channels','contacts','leads','conversations','messages','opportunities','followups','handoffs','automation_rules','knowledge_sources','usage_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy tenant_access on public.%I for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id))',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create index on public.%I(organization_id)',t);
 end loop;
end $$;
create index on public.messages(organization_id,conversation_id,occurred_at);
create index on public.followups(due_at) where status='pending';

-- Atomic ingest: concurrent delivery/retries have one receipt, one contact and one conversation.
create function public.ingest_inbound(p_event jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 org uuid := (p_event->>'organizationId')::uuid;
 chan uuid := (p_event->>'channelId')::uuid;
 msg public.messages; ct public.contacts; conv public.conversations;
 kind text; duplicate boolean := false;
begin
 if coalesce(p_event->>'providerMessageId','')='' or coalesce(p_event->>'externalContactId','')='' or coalesce(p_event->>'origin','') not in ('meta','simulated') or (coalesce(p_event->>'text','')='' and p_event->'media' is null) then raise exception 'Invalid inbound event'; end if;
 select channels.kind into strict kind from public.channels where organization_id=org and id=chan;
 if kind is distinct from p_event->>'channelKind' then raise exception 'Channel kind mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text || chan::text || (p_event->>'providerMessageId'),0));
 select * into msg from public.messages where organization_id=org and channel_id=chan and provider_message_id=p_event->>'providerMessageId';
 if found then
 duplicate := true;
 select * into strict conv from public.conversations where organization_id=org and id=msg.conversation_id;
 select * into strict ct from public.contacts where organization_id=org and id=conv.contact_id;
 else
 insert into public.contacts(organization_id,channel_id,external_id,name) values(org,chan,p_event->>'externalContactId',coalesce(nullif(p_event->>'contactName',''),p_event->>'externalContactId'))
 on conflict(organization_id,channel_id,external_id) do update set external_id=excluded.external_id returning * into ct;
 insert into public.leads(organization_id,contact_id,source) values(org,ct.id,kind) on conflict(organization_id,contact_id) do nothing;
 insert into public.conversations(organization_id,contact_id,channel_id,channel_kind,last_inbound_at) values(org,ct.id,chan,kind,(p_event->>'occurredAt')::timestamptz)
 on conflict(organization_id,channel_id,contact_id) do update set last_inbound_at=greatest(conversations.last_inbound_at,excluded.last_inbound_at), unanswered=true returning * into conv;
 insert into public.messages(organization_id,conversation_id,channel_id,provider_message_id,direction,text,media,occurred_at,origin,status)
 values(org,conv.id,chan,p_event->>'providerMessageId','inbound',coalesce(p_event->>'text',''),p_event->'media',(p_event->>'occurredAt')::timestamptz,p_event->>'origin','received') returning * into msg;
 update public.followups set status='cancelled' where organization_id=org and conversation_id=conv.id and status in ('pending','claimed');
 end if;
 return jsonb_build_object('duplicate',duplicate,'contact',to_jsonb(ct),'conversation',to_jsonb(conv),'message',to_jsonb(msg));
end $$;
revoke all on function public.ingest_inbound(jsonb) from public,anon;
grant execute on function public.ingest_inbound(jsonb) to authenticated,service_role;

-- Metering is server-authoritative: clients may inspect but never forge or erase usage.
drop policy tenant_access on public.usage_events;
create policy tenant_usage_read on public.usage_events for select to authenticated using(public.is_org_member(organization_id));
revoke insert,update,delete on public.usage_events from authenticated;
-- Only administrators may publish approved business knowledge.
drop policy tenant_access on public.knowledge_sources;
create policy knowledge_read on public.knowledge_sources for select to authenticated using(public.is_org_member(organization_id));
create policy knowledge_manage on public.knowledge_sources for all to authenticated
using(exists(select 1 from public.memberships m where m.organization_id=knowledge_sources.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')))
with check(exists(select 1 from public.memberships m where m.organization_id=knowledge_sources.organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));
-- Real connection state is established by the credential-validation service, not a client flag.
drop policy tenant_access on public.channels;
create policy channels_read on public.channels for select to authenticated using(public.is_org_member(organization_id));
create policy channels_insert on public.channels for insert to authenticated with check(public.is_org_member(organization_id) and status in ('disconnected','pending_permissions','simulated'));
create policy channels_update on public.channels for update to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id) and status in ('disconnected','pending_permissions','simulated'));
create policy channels_delete on public.channels for delete to authenticated using(public.is_org_member(organization_id));
grant all on public.channels,public.contacts,public.leads,public.conversations,public.messages,public.opportunities,public.followups,public.handoffs,public.automation_rules,public.knowledge_sources,public.usage_events to service_role;

-- Protect the table itself: PostgREST direct writes must not bypass the ingest guard.
-- Keep SECURITY INVOKER so the caller role is preserved. Only workers attest Meta origin.
create function public.enforce_provider_message_integrity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('service_role','postgres') then
  if TG_OP <> 'INSERT' then
   if OLD.origin = 'meta' then
    raise exception 'Provider messages are managed by trusted workers' using errcode='42501';
   end if;
  end if;
  if TG_OP <> 'DELETE' then
   if NEW.origin = 'meta' then
    raise exception 'Provider origin requires trusted worker' using errcode='42501';
   end if;
  end if;
 end if;
 if TG_OP = 'DELETE' then return OLD; end if;
 return NEW;
end $$;
revoke all on function public.enforce_provider_message_integrity() from public,anon,authenticated;
create trigger messages_provider_integrity before insert or update or delete on public.messages
for each row execute function public.enforce_provider_message_integrity();
