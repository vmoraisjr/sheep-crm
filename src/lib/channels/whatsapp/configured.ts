import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptCredential } from '../security';
import { WhatsAppCloudAdapter } from './client';
/** Server-only: serviceRoleClient must never be created in or serialized to a browser. */
export async function getWhatsAppAdapter(serviceRoleClient: SupabaseClient, organizationId: string, channelId: string): Promise<WhatsAppCloudAdapter> {
  const encryptionKey = process.env.META_CREDENTIAL_ENCRYPTION_KEY;
  const graphVersion = process.env.META_GRAPH_VERSION;
  if (!encryptionKey || !graphVersion) throw new Error('WhatsApp credentials not configured');
  const { data, error } = await serviceRoleClient.from('whatsapp_connections').select('phone_number_id,encrypted_access_token').eq('organization_id', organizationId).eq('channel_id', channelId).maybeSingle();
  if (error || !data) throw new Error('WhatsApp connection unavailable');
  return new WhatsAppCloudAdapter({ phoneNumberId: data.phone_number_id, accessToken: decryptCredential(data.encrypted_access_token, encryptionKey, organizationId), graphVersion });
}
