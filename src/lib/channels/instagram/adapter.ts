import type { AdapterContext, ChannelAdapter, NormalizedInbound, OutboundMessage, SendResult } from '@/lib/domain/types';
import { InstagramClient } from './client';
import { normalizeInstagram } from './webhook';
export interface InstagramDeliveryStore {
  /** Atomically reserve key scoped to organization/channel. A reserved key must not be blindly retried after an ambiguous network failure. */
  reserve(message: OutboundMessage): Promise<{ state: 'new' | 'pending' | 'sent'; providerMessageId?: string }>;
  complete(message: OutboundMessage, result: SendResult): Promise<void>;
  policy(message: OutboundMessage): Promise<{ lastInboundAt: string; optedOut: boolean }>;
}
export class OfficialInstagramAdapter implements ChannelAdapter {
  readonly kind = 'instagram' as const;
  readonly mode = 'meta' as const;
  constructor(private client: InstagramClient, private connection: { organizationId: string; channelId: string; accountId: string; token: string }, private store: InstagramDeliveryStore) {}
  normalize(payload: unknown, context: AdapterContext): NormalizedInbound[] {
    if (context.organizationId !== this.connection.organizationId || context.channelId !== this.connection.channelId || context.channelKind !== 'instagram') throw new Error('Tenant/channel mismatch');
    return normalizeInstagram(payload, { ...context, accountId: this.connection.accountId }).messages;
  }
  async send(message: OutboundMessage): Promise<SendResult> {
    if (message.organizationId !== this.connection.organizationId || message.channelId !== this.connection.channelId) throw new Error('Tenant/channel mismatch');
    if (!message.idempotencyKey || message.template || message.media) throw new Error('Instagram adapter currently supports replies with plain text only');
    const policy = await this.store.policy(message);
    // Check again in client immediately before making the provider request.
    if (policy.optedOut || !Number.isFinite(Date.parse(policy.lastInboundAt)) || Date.now() - Date.parse(policy.lastInboundAt) >= 86_400_000) throw new Error('Instagram reply not allowed');
    const reservation = await this.store.reserve(message);
    if (reservation.state === 'sent' && reservation.providerMessageId) return { providerMessageId: reservation.providerMessageId, origin: 'meta', status: 'sent' };
    if (reservation.state !== 'new') throw new Error('Delivery pending reconciliation; automatic resend blocked');
    const result = await this.client.send({ accountId: this.connection.accountId, recipientId: message.recipientId, text: message.text, token: this.connection.token, ...policy });
    const sent: SendResult = { ...result, status: 'sent' };
    await this.store.complete(message, sent);
    return sent;
  }
}
