export interface InstagramInbound {
  organizationId: string; channelId: string; channelKind: 'instagram'; providerMessageId: string;
  externalContactId: string; text?: string; media?: { kind: 'image' | 'audio' | 'video' | 'document'; providerMediaId?: string };
  occurredAt: string; origin: 'meta' | 'simulated';
}
export interface InstagramSeen { providerMessageId: string; occurredAt: string; status: 'read' }
interface Envelope { object?: string; entry?: Array<{ id?: string; messaging?: Array<{ sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string; payload?: { id?: string } }> }; read?: { mid?: string } }> }> }
export function normalizeInstagram(payload: unknown, context: { organizationId: string; channelId: string; accountId: string }): { messages: InstagramInbound[]; statuses: InstagramSeen[] } {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid webhook envelope');
  const envelope = payload as Envelope;
  if (envelope.object !== 'instagram' || !Array.isArray(envelope.entry)) throw new Error('Invalid Instagram webhook');
  const messages: InstagramInbound[] = [], statuses: InstagramSeen[] = [];
  for (const entry of envelope.entry) {
    if (entry.id !== context.accountId) continue; // Never route using a tenant supplied in the payload.
    if (!Array.isArray(entry.messaging)) continue;
    for (const event of entry.messaging) {
      if (!event || !Number.isFinite(event.timestamp) || event.timestamp! <= 0) continue;
      const date = new Date(event.timestamp!);
      if (!Number.isFinite(date.getTime())) continue;
      const occurredAt = date.toISOString();
      if (event.read?.mid && event.sender?.id) statuses.push({ providerMessageId: event.read.mid, occurredAt, status: 'read' });
      const message = event.message;
      if (!message?.mid || message.is_echo || !event.sender?.id || event.recipient?.id !== context.accountId) continue;
      if (typeof message.text !== 'string' && !message.attachments?.length) continue;
      const attachment = message.attachments?.[0];
      messages.push({ organizationId: context.organizationId, channelId: context.channelId, channelKind: 'instagram', providerMessageId: message.mid, externalContactId: event.sender.id, text: message.text, media: attachment ? { kind: attachment.type === 'image' || attachment.type === 'audio' || attachment.type === 'video' ? attachment.type : 'document', providerMediaId: attachment.payload?.id } : undefined, occurredAt, origin: 'meta' });
    }
  }
  return { messages, statuses };
}
export interface InstagramWebhookQueue {
  /** Must persist transactionally with unique connection/event key before acknowledgment. */
  enqueue(connectionId: string, organizationId: string, messages: InstagramInbound[], statuses: InstagramSeen[]): Promise<void>;
}
