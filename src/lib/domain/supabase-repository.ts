import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, DomainRepository, IngestResult, Message, NormalizedInbound } from './types';
import { required, validateInbound } from './validation';

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase()), camelize(item)]));
  return value;
}
/** Bind to the organization resolved from the authenticated session, never request input. */
export class SupabaseDomainRepository implements DomainRepository {
  constructor(private readonly client: SupabaseClient, private readonly organizationId: string) { required(organizationId, 'organization'); }
  private assertTenant(organizationId: string) { if (organizationId !== this.organizationId) throw new Error('Tenant mismatch'); }
  async ingest(event: NormalizedInbound): Promise<IngestResult> {
    this.assertTenant(event.organizationId); validateInbound(event);
    const { data, error } = await this.client.rpc('ingest_inbound', { p_event: event });
    if (error) throw new Error(`Inbound persistence failed: ${error.code ?? 'unknown'}`);
    if (!data) throw new Error('Inbound persistence returned no receipt');
    return camelize(data) as IngestResult;
  }
  async listConversations(organizationId: string): Promise<Conversation[]> {
    this.assertTenant(organizationId);
    const { data, error } = await this.client.from('conversations').select('*').eq('organization_id', this.organizationId).order('last_inbound_at', { ascending: false });
    if (error) throw new Error(`Conversation read failed: ${error.code ?? 'unknown'}`);
    return camelize(data ?? []) as Conversation[];
  }
  async listMessages(organizationId: string, conversationId: string): Promise<Message[]> {
    this.assertTenant(organizationId); required(conversationId, 'conversation');
    const { data, error } = await this.client.from('messages').select('*').eq('organization_id', this.organizationId).eq('conversation_id', conversationId).order('occurred_at');
    if (error) throw new Error(`Message read failed: ${error.code ?? 'unknown'}`);
    return camelize(data ?? []) as Message[];
  }
}
