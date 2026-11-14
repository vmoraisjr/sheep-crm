import 'server-only';
import { createHash } from 'node:crypto';
import type { OutboundMessage, SendResult } from '@/lib/domain/types';
import { OfficialInstagramAdapter } from './adapter';
import { instagramRuntime } from './runtime';
import { decryptToken } from './security';
/** Call only after session authorization; organizationId must come from requireTenant(), never a request body. */
export async function sendInstagramReply(message: OutboundMessage): Promise<SendResult> {
  const configured = instagramRuntime();
  if (!configured) throw new Error('Instagram disconnected: official credentials unavailable');
  const { data: connection, error } = await configured.db.from('instagram_connections').select('id,account_id,encrypted_token,expires_at').eq('organization_id', message.organizationId).eq('channel_id', message.channelId).eq('status', 'connected').single();
  if (error || !connection || Date.parse(connection.expires_at) <= Date.now()) throw new Error('Instagram reconnect required');
  const adapter = new OfficialInstagramAdapter(configured.client, { organizationId: message.organizationId, channelId: message.channelId, accountId: connection.account_id, token: decryptToken(connection.encrypted_token, configured.encryptionKey, message.organizationId) }, {
    async policy(outbound) {
      const { data: contact, error: contactError } = await configured.db.from('contacts').select('id,opted_out').eq('organization_id', outbound.organizationId).eq('channel_id', outbound.channelId).eq('external_id', outbound.recipientId).single();
      if (contactError || !contact) throw new Error('Instagram contact unavailable');
      const { data: conversation, error: conversationError } = await configured.db.from('conversations').select('last_inbound_at').eq('organization_id', outbound.organizationId).eq('channel_id', outbound.channelId).eq('contact_id', contact.id).single();
      if (conversationError || !conversation) throw new Error('Instagram conversation unavailable');
      return { lastInboundAt: conversation.last_inbound_at, optedOut: contact.opted_out };
    },
    async reserve(outbound) {
      const hash = createHash('sha256').update(JSON.stringify([outbound.recipientId, outbound.text])).digest('hex');
      const { data, error } = await configured.db.rpc('reserve_instagram_outbound', { p_org: outbound.organizationId, p_channel: outbound.channelId, p_key: outbound.idempotencyKey, p_hash: hash });
      if (error || !data || !['new', 'pending', 'sent'].includes(data.state)) throw new Error('Outbound reservation unavailable');
      return data as { state: 'new' | 'pending' | 'sent'; providerMessageId?: string };
    },
    async complete(outbound, result) {
      const { error } = await configured.db.rpc('complete_instagram_outbound', { p_org: outbound.organizationId, p_channel: outbound.channelId, p_key: outbound.idempotencyKey, p_provider: result.providerMessageId, p_recipient: outbound.recipientId, p_text: outbound.text });
      if (error) throw new Error('Instagram accepted delivery; persistence requires reconciliation. Do not resend.');
    },
  });
  return adapter.send(message);
}
