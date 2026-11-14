import { timingSafeEqual } from 'node:crypto';
import { instagramRuntime } from '@/lib/channels/instagram/runtime';
import { verifySignature } from '@/lib/channels/instagram/security';
import { normalizeInstagram } from '@/lib/channels/instagram/webhook';
export const runtime = 'nodejs';
type Context = { params: Promise<{ connectionId: string }> };
async function connection(context: Context) {
  const configured = instagramRuntime();
  if (!configured) return null;
  const { connectionId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return null;
  const { data, error } = await configured.db.from('instagram_connections').select('id,organization_id,account_id,channel_id,status').eq('id', connectionId).single();
  return error || !data || data.status !== 'connected' ? null : { configured, data };
}
export async function GET(request: Request, context: Context) {
  const found = await connection(context);
  if (!found) return new Response('Integration unavailable', { status: 503 });
  const query = new URL(request.url).searchParams;
  const supplied = Buffer.from(query.get('hub.verify_token') ?? '');
  const expected = Buffer.from(found.configured.verifyToken);
  const challenge = query.get('hub.challenge');
  if (query.get('hub.mode') !== 'subscribe' || !challenge || challenge.length > 1024 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response('Forbidden', { status: 403 });
  return new Response(challenge, { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request, context: Context) {
  const found = await connection(context);
  if (!found) return new Response('Integration unavailable', { status: 503 });
  if (Number(request.headers.get('content-length') || 0) > 1_048_576) return new Response('Too large', { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 1_048_576) return new Response('Too large', { status: 413 });
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), found.configured.appSecret)) return new Response('Forbidden', { status: 403 });
  try {
    if (!found.data.channel_id) return new Response('Channel not provisioned', { status: 503 });
    const normalized = normalizeInstagram(JSON.parse(raw), { organizationId: found.data.organization_id, channelId: found.data.channel_id, accountId: found.data.account_id });
    const rows = [
      ...normalized.messages.map(message => ({ connection_id: found.data.id, organization_id: found.data.organization_id, event_key: `message:${message.providerMessageId}`, event: message, kind: 'message' })),
      ...normalized.statuses.map(status => ({ connection_id: found.data.id, organization_id: found.data.organization_id, event_key: `read:${status.providerMessageId}`, event: status, kind: 'status' })),
    ];
    if (rows.length) {
      const { error } = await found.configured.db.from('instagram_webhook_jobs').upsert(rows, { onConflict: 'connection_id,event_key', ignoreDuplicates: true });
      if (error) return new Response('Queue unavailable', { status: 503 });
    }
    return Response.json({ accepted: true });
  } catch { return new Response('Invalid payload', { status: 400 }); }
}
