import type { NormalizedInbound } from './types';
export function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new Error(`Invalid ${label}`);
  return value;
}
export function validateInbound(event: NormalizedInbound): void {
  for (const key of ['organizationId','channelId','providerMessageId','externalContactId'] as const) required(event[key], key);
  if (!['whatsapp','instagram'].includes(event.channelKind)) throw new Error('Invalid channel');
  if (!['meta','simulated'].includes(event.origin)) throw new Error('Invalid origin');
  if (!Number.isFinite(Date.parse(event.occurredAt))) throw new Error('Invalid timestamp');
  if ((!event.text?.trim() && !event.media) || (event.text?.length ?? 0) > 10000) throw new Error('Invalid message content');
}
