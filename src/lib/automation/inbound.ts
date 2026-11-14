import type { DomainRepository, NormalizedInbound } from '../domain/types';
import type { AutomationRepository } from './service';
import { runAutomation } from './service';
/** Shared inbound orchestration; provider persistence must call this after durable ingestion. */
export async function ingestAndAutomate(domain:DomainRepository,automation:AutomationRepository,event:NormalizedInbound){
 const received=await domain.ingest(event);
 // Re-deliveries also recover failed claims; committed decisions remain deduplicated.
 const decision=await runAutomation(automation,event.organizationId,received.conversation.id,received.message.id);
 return {received,automation:decision};
}
