# WhatsApp Cloud API (#3)

## Implemented and verified locally

Official Graph API text, media-ID messages, approved-template sends and media metadata retrieval; raw-body SHA-256 webhook signature verification; challenge; durable tenant-routed asynchronous ingestion; leased queue claims with SKIP LOCKED and retry backoff; domain idempotence; monotonic delivery statuses. An AES-256-GCM credential envelope binds each token to its organization as authenticated data. Consent, opt-out, 24-hour service window, approved templates and explicit cost budget fail closed.

`SimulatedWhatsAppAdapter` is **simulated**, never a real Meta integration. Unit tests replace HTTP and persistence. No sandbox message has been sent and no live permission or credential has been validated.

## Configuration and blocked acceptance

A real sandbox E2E remains **blocked** until an operator supplies an eligible WABA/phone ID, Meta app secret and verify token, approved access token with `whatsapp_business_messaging`/applicable management permissions, app webhook subscription, recipient opt-in, and public HTTPS callback. Choose an available official Graph API version in `WhatsAppCredentials.graphVersion` from Meta's current version support; no version is silently assumed.

Server-only variables: `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_WORKER_SECRET`, and `META_CREDENTIAL_ENCRYPTION_KEY` (32 random bytes in base64). Set Supabase URL as documented in the foundation. Never prefix secrets with NEXT_PUBLIC. Connections are provisioned service-side into `whatsapp_connections`; encrypt access tokens using `encryptCredential(token, key, organizationId)`. An authorized operator must validate that channel_id and phone_number_id belong to that tenant. No token provisioning UI is exposed.

Subscribe `/api/webhooks/whatsapp`; the route checks raw bytes before parsing. Unknown phone IDs and database failures return 503 so events are retried rather than silently dropped. The callback must use the same app secret as the subscribed Meta application. Configure a scheduler to `POST /api/internal/whatsapp-worker` with `Authorization: Bearer <WHATSAPP_WORKER_SECRET>` every minute. The database claim lease is five minutes, bounded batch 100 (runtime 20), eight attempts, then failed for operator inspection. Replaying failed jobs after fixing the cause is safe for inbound ingestion. Preserve provider IDs. Do not retry ambiguous outbound timeouts automatically: Meta sends are not proven idempotent. Reconcile delivery state before any manual resend.

`WhatsAppCloudAdapter.send` requires authoritative server-side policy inputs, and the approved flag must come from a validated template catalog. The adapter is not exposed as an unauthenticated send endpoint. It returns the provider ID for persistence before status ingestion. `getMedia` returns Meta metadata; downloading bytes is deliberately a server-side concern. Do not fetch arbitrary customer URLs. MIME/size scanning and private storage retention must precede displaying media bytes. No file download proxy is implemented here.

## Sandbox checklist (not executed)

1. Configure sandbox and authorized test recipient using Meta developer console. Obtain required permissions; verify callback and app subscriptions.
2. Store encrypted token/connection server-side, verify cross-tenant ownership, start scheduled worker.
3. Send opted-in inbound text and supported media; replay webhook; confirm one domain message, correct tenant and timestamps.
4. Reply using official adapter inside the window; persist returned message ID. Confirm sent/delivered/read statuses do not regress.
5. Outside window, verify plain text blocked and only a catalog-approved template with explicit consent/cost budget is accepted. Verify opt-out blocks both.
6. Revoke token, verify sanitized provider errors and reconnect provisioning; never log bearer tokens or raw payloads.

Official references: https://developers.facebook.com/docs/whatsapp/cloud-api/ ; https://developers.facebook.com/docs/graph-api/webhooks/getting-started ; https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
