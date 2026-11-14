/** IDs are opaque. Every persisted entity belongs to one organization. */
export type ChannelKind = 'whatsapp' | 'instagram';
export type Origin = 'meta' | 'simulated';
export type OpportunityStage = 'new' | 'qualified' | 'negotiation' | 'won' | 'lost';
export interface TenantEntity { id: string; organizationId: string; createdAt: string }
export interface Contact extends TenantEntity { externalId: string; name: string; optedIn: boolean; optedOut: boolean; tags: string[] }
export interface Lead extends TenantEntity { contactId: string; source: ChannelKind }
export interface Channel extends TenantEntity { kind: ChannelKind; externalId: string; status: 'disconnected' | 'pending_permissions' | 'simulated' | 'connected' }
export interface Conversation extends TenantEntity { contactId: string; channelId: string; channelKind: ChannelKind; aiPaused: boolean; assignedTo: string | null; lastInboundAt: string; unanswered: boolean }
export interface Media { kind: 'image' | 'audio' | 'video' | 'document'; providerMediaId?: string; url?: string; mimeType?: string }
export interface Message extends TenantEntity { conversationId: string; channelId: string; providerMessageId: string; direction: 'inbound' | 'outbound'; text: string; media?: Media; occurredAt: string; origin: Origin; status: 'received' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed' }
export interface Opportunity extends TenantEntity { contactId: string; stage: OpportunityStage; assignee: string | null; nextAction: string; valueCents: number | null }
export interface Followup extends TenantEntity { conversationId: string; opportunityId: string; dueAt: string; status: 'pending' | 'claimed' | 'sent' | 'cancelled' | 'failed'; idempotencyKey: string; attempts: number }
export interface Handoff extends TenantEntity { conversationId: string; reason: string; assignedTo: string | null; context: string }
export interface AutomationRule extends TenantEntity { kind: 'greeting' | 'hours' | 'followup' | 'pause' | 'handoff'; enabled: boolean; configuration: Record<string, unknown> }
export interface KnowledgeSource extends TenantEntity { title: string; content: string; approvedAt: string | null; approvedBy: string | null }
export interface UsageEvent extends TenantEntity { eventKey: string; kind: 'automated_conversation' | 'message' | 'tokens'; quantity: number; costMicros: number }
export interface NormalizedInbound { organizationId: string; channelId: string; channelKind: ChannelKind; providerMessageId: string; externalContactId: string; contactName?: string; text?: string; media?: Media; occurredAt: string; origin: Origin }
export interface AdapterContext { organizationId: string; channelId: string; channelKind: ChannelKind }
export interface OutboundMessage { organizationId: string; channelId: string; recipientId: string; text: string; idempotencyKey: string; template?: { name: string; language: string }; media?: Media }
export interface SendResult { providerMessageId: string; origin: Origin; status: 'sent' | 'pending' }
export interface ChannelAdapter { readonly kind: ChannelKind; readonly mode: Origin; normalize(payload: unknown, context: AdapterContext): NormalizedInbound[]; send(message: OutboundMessage): Promise<SendResult> }
export interface IngestResult { duplicate: boolean; contact: Contact; conversation: Conversation; message: Message }
export interface DomainRepository { ingest(event: NormalizedInbound): Promise<IngestResult>; listConversations(organizationId: string): Promise<Conversation[]>; listMessages(organizationId: string, conversationId: string): Promise<Message[]> }
