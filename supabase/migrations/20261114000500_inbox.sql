-- A stable request key survives provider ID assignment. Unknown outcomes are never retried automatically.
create table public.manual_reply_requests (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 idempotency_key uuid not null,
 conversation_id uuid not null,
 message_id uuid not null,
 status text not null check(status in ('processing','sent','unknown')),
 created_at timestamptz not null default now(),
 primary key(organization_id,idempotency_key),
 foreign key(organization_id,conversation_id) references public.conversations(organization_id,id) on delete cascade,
 foreign key(organization_id,message_id) references public.messages(organization_id,id) on delete cascade
);
alter table public.manual_reply_requests enable row level security;
-- Server route uses service-role only after authenticating and resolving the tenant.
revoke all on public.manual_reply_requests from anon,authenticated;
