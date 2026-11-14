import type { AdapterContext, ChannelAdapter, ChannelKind, NormalizedInbound, OutboundMessage, SendResult } from './types';
import { required, validateInbound } from './validation';
/** Development adapter. Never claims delivery to Meta. */
export class SimulatedChannelAdapter implements ChannelAdapter {
  readonly mode = 'simulated' as const;
  private readonly sent = new Map<string, SendResult>();
  constructor(readonly kind: ChannelKind) {}
  normalize(payload: unknown, context: AdapterContext): NormalizedInbound[] {
    if (context.channelKind !== this.kind || !payload || typeof payload !== 'object') throw new Error('Invalid simulated event');
    const item = payload as Record<string, unknown>;
    const event: NormalizedInbound = { ...context, providerMessageId: required(item.id, 'id'), externalContactId: required(item.from, 'from'), contactName: typeof item.name === 'string' ? item.name : undefined, text: required(item.text, 'text'), occurredAt: required(item.timestamp, 'timestamp'), origin: 'simulated' };
    validateInbound(event);
    return [event];
  }
  async send(message: OutboundMessage): Promise<SendResult> {
    required(message.organizationId, 'organization'); required(message.channelId, 'channel'); required(message.recipientId, 'recipient'); required(message.text, 'text'); required(message.idempotencyKey, 'idempotency key');
    const key = JSON.stringify([message.organizationId, message.channelId, message.idempotencyKey]);
    const result = this.sent.get(key) ?? { providerMessageId: `simulated:${crypto.randomUUID()}`, origin: 'simulated' as const, status: 'sent' as const };
    this.sent.set(key, result);
    return { ...result };
  }
}
