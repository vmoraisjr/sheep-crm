import { timingSafeEqual } from 'node:crypto';
import { verifyMetaSignature } from '../security';
import type { NormalizedInbound, AdapterContext } from '../../domain/types';

export type WhatsAppEnvelope = { phoneNumberId: string; eventKey: string; payload: Record<string, unknown> };
type Obj = Record<string, unknown>;
function obj(value: unknown): Obj { return value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {}; }
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function extractWhatsAppEvents(payload: unknown): WhatsAppEnvelope[] {
  const root = obj(payload);
  if (root.object !== 'whatsapp_business_account') throw new Error('invalid_object');
  const result: WhatsAppEnvelope[] = [];
  for (const entry of arr(root.entry)) for (const change of arr(obj(entry).changes)) {
    const value = obj(obj(change).value);
    const phoneNumberId = obj(value.metadata).phone_number_id;
    if (typeof phoneNumberId !== 'string') continue;
    for (const message of arr(value.messages)) {
      const m = obj(message);
      if (typeof m.id !== 'string' || typeof m.from !== 'string' || typeof m.timestamp !== 'string') throw new Error('invalid_message');
      result.push({ phoneNumberId, eventKey: `message:${m.id}`, payload: { message: m, contacts: value.contacts } });
    }
    for (const status of arr(value.statuses)) {
      const s = obj(status);
      if (typeof s.id !== 'string' || typeof s.status !== 'string' || typeof s.timestamp !== 'string') throw new Error('invalid_status');
      result.push({ phoneNumberId, eventKey: `status:${s.id}:${s.status}:${s.timestamp}`, payload: { status: s } });
    }
  }
  return result;
}
export function normalizeWhatsAppMessage(payload: Record<string, unknown>, context: AdapterContext): NormalizedInbound {
  const m = obj(payload.message);
  if (typeof m.id !== 'string' || typeof m.from !== 'string' || typeof m.timestamp !== 'string') throw new Error('invalid_message');
  const timestamp = Number(m.timestamp) * 1000;
  if (!Number.isFinite(timestamp)) throw new Error('invalid_timestamp');
  const profile = arr(payload.contacts).map(obj).find(c => c.wa_id === m.from);
  const name = obj(profile?.profile).name;
  const type = m.type;
  const media = typeof type === 'string' && ['image', 'audio', 'video', 'document'].includes(type) ? obj(m[type]) : null;
  return {
    ...context, channelKind: 'whatsapp', providerMessageId: m.id, externalContactId: m.from,
    ...(typeof name === 'string' ? { contactName: name } : {}),
    text: typeof obj(m.text).body === 'string' ? obj(m.text).body as string : typeof media?.caption === 'string' ? media.caption : '',
    ...(media && typeof media.id === 'string' ? { media: { kind: type as 'image' | 'audio' | 'video' | 'document', providerMediaId: media.id, ...(typeof media.mime_type === 'string' ? { mimeType: media.mime_type } : {}) } } : {}),
    occurredAt: new Date(timestamp).toISOString(), origin: 'meta',
  };
}
export function verifyChallenge(url: URL, verifyToken: string): string | null {
  const candidate = url.searchParams.get('hub.verify_token') ?? '';
  const challenge = url.searchParams.get('hub.challenge');
  if (!verifyToken || url.searchParams.get('hub.mode') !== 'subscribe' || !challenge || challenge.length > 256 || candidate.length !== verifyToken.length) return null;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(verifyToken)) ? challenge : null;
}
export async function receiveWhatsAppWebhook(rawBody: string, signature: string | null, appSecret: string, enqueue: (events: WhatsAppEnvelope[]) => Promise<void>): Promise<number> {
  if (!verifyMetaSignature(rawBody, signature, appSecret)) return 401;
  let events: WhatsAppEnvelope[];
  try { events = extractWhatsAppEvents(JSON.parse(rawBody)); } catch { return 400; }
  // Acknowledge only after durable storage; Meta retries a non-2xx response.
  try { await enqueue(events); } catch { return 503; }
  return 200;
}
