import { receiveWhatsAppWebhook, verifyChallenge } from '../../../../lib/channels/whatsapp/webhook';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const challenge = verifyChallenge(new URL(request.url), process.env.META_WEBHOOK_VERIFY_TOKEN ?? '');
  return new Response(challenge ?? 'Verification failed', { status: challenge === null ? 403 : 200 });
}
export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!appSecret || !supabaseUrl || !serviceKey) return new Response('Webhook not configured', { status: 503 });
  if (Number(request.headers.get('content-length') ?? '0') > 1_048_576) return new Response('Payload too large', { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) return new Response('Missing body', { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_048_576) { await reader.cancel(); return new Response('Payload too large', { status: 413 }); }
    chunks.push(value);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');
  const status = await receiveWhatsAppWebhook(rawBody, request.headers.get('x-hub-signature-256'), appSecret, async events => {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/enqueue_whatsapp_events`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Webhook queue unavailable');
  });
  return new Response(status === 200 ? 'EVENT_RECEIVED' : 'Webhook rejected', { status });
}
