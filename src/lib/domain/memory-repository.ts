import type { Contact, Conversation, DomainRepository, IngestResult, Message, NormalizedInbound } from './types';
import { required, validateInbound } from './validation';
/** Ephemeral development/test repository; never used as production persistence. */
export class MemoryDomainRepository implements DomainRepository {
  private contacts = new Map<string, Contact>();
  private conversations = new Map<string, Conversation>();
  private messages = new Map<string, Message>();
  private receipts = new Map<string, IngestResult>();
  private key(...values: string[]): string { return JSON.stringify(values); }
  async ingest(event: NormalizedInbound): Promise<IngestResult> {
    validateInbound(event);
    const receiptKey = this.key(event.organizationId, event.channelId, event.providerMessageId);
    const previous = this.receipts.get(receiptKey);
    if (previous) return structuredClone({ ...previous, duplicate: true });
    const createdAt = new Date().toISOString();
    // Include channel ID so unrelated account-scoped identities cannot collide.
    const contactKey = this.key(event.organizationId, event.channelId, event.externalContactId);
    let contact = this.contacts.get(contactKey);
    if (!contact) { contact = { id: crypto.randomUUID(), organizationId: event.organizationId, createdAt, externalId: event.externalContactId, name: event.contactName ?? event.externalContactId, optedIn: false, optedOut: false, tags: [] }; this.contacts.set(contactKey, contact); }
    let conversation = this.conversations.get(contactKey);
    if (!conversation) { conversation = { id: crypto.randomUUID(), organizationId: event.organizationId, createdAt, contactId: contact.id, channelId: event.channelId, channelKind: event.channelKind, aiPaused: true, assignedTo: null, lastInboundAt: event.occurredAt, unanswered: true }; this.conversations.set(contactKey, conversation); }
    conversation.lastInboundAt = event.occurredAt > conversation.lastInboundAt ? event.occurredAt : conversation.lastInboundAt;
    conversation.unanswered = true;
    const message: Message = { id: crypto.randomUUID(), organizationId: event.organizationId, createdAt, conversationId: conversation.id, channelId: event.channelId, providerMessageId: event.providerMessageId, direction: 'inbound', text: event.text ?? '', media: event.media, occurredAt: event.occurredAt, origin: event.origin, status: 'received' };
    this.messages.set(message.id, message);
    const result = { duplicate: false, contact, conversation, message };
    this.receipts.set(receiptKey, structuredClone(result));
    return structuredClone(result);
  }
  async listConversations(organizationId: string): Promise<Conversation[]> { required(organizationId, 'organization'); return structuredClone([...this.conversations.values()].filter(row => row.organizationId === organizationId).sort((a,b) => b.lastInboundAt.localeCompare(a.lastInboundAt))); }
  async listMessages(organizationId: string, conversationId: string): Promise<Message[]> { required(organizationId, 'organization'); required(conversationId, 'conversation'); return structuredClone([...this.messages.values()].filter(row => row.organizationId === organizationId && row.conversationId === conversationId).sort((a,b) => a.occurredAt.localeCompare(b.occurredAt))); }
}
