import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SupabaseDomainRepository } from '../../../../lib/domain/supabase-repository';
import { processWhatsAppJobs, type WhatsAppJob } from '../../../../lib/channels/whatsapp/worker';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const workerSecret = process.env.WHATSAPP_WORKER_SECRET;
  const token = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${workerSecret}`;
  if (!workerSecret || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return new Response('Unauthorized', { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response('Worker not configured', { status: 503 });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const check = (error: unknown) => { if (error) throw new Error('Worker persistence failure'); };
  try {
    const result = await processWhatsAppJobs({
      async claim() { const { data, error } = await client.rpc('claim_whatsapp_jobs', { batch_size: 20 }); check(error); return (data ?? []) as WhatsAppJob[]; },
      async done(id) { const { error } = await client.from('whatsapp_webhook_jobs').update({ status: 'done' }).eq('id', id); check(error); },
      async retry(id, attempts) {
        const { error } = await client.from('whatsapp_webhook_jobs').update({ status: attempts >= 8 ? 'failed' : 'pending', available_at: new Date(Date.now() + Math.min(3600, 2 ** attempts * 10) * 1000).toISOString() }).eq('id', id); check(error);
      },
      async updateStatus(organizationId, channelId, providerMessageId, status) {
        const { error } = await client.rpc('update_whatsapp_message_status', { tenant_id: organizationId, channel: channelId, provider_id: providerMessageId, next_status: status }); check(error);
      },
    }, organizationId => new SupabaseDomainRepository(client, organizationId));
    return Response.json(result);
  } catch { return new Response('Worker unavailable', { status: 503 }); }
}
