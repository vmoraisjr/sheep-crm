import type { DomainRepository } from '../../domain/types';
import { normalizeWhatsAppMessage } from './webhook';
export type WhatsAppJob = { id: number; organization_id: string; channel_id: string; payload: Record<string, unknown>; attempts: number };
export interface WhatsAppJobQueue {
  claim(): Promise<WhatsAppJob[]>;
  done(id: number): Promise<void>;
  retry(id: number, attempts: number): Promise<void>;
  updateStatus(organizationId: string, channelId: string, providerMessageId: string, status: 'sent' | 'delivered' | 'read' | 'failed'): Promise<void>;
}
/** Scheduling invokes this worker with a service-role queue and tenant-scoped domain repository. */
export async function processWhatsAppJobs(queue: WhatsAppJobQueue, repositoryForTenant: (organizationId: string) => DomainRepository) {
  let completed = 0;
  for (const job of await queue.claim()) {
    try {
      if (job.payload.message) {
        await repositoryForTenant(job.organization_id).ingest(normalizeWhatsAppMessage(job.payload, { organizationId: job.organization_id, channelId: job.channel_id, channelKind: 'whatsapp' }));
      } else {
        const status = job.payload.status as Record<string, unknown> | undefined;
        if (!status || typeof status.id !== 'string' || !['sent', 'delivered', 'read', 'failed'].includes(String(status.status))) throw new Error('Unsupported message status');
        await queue.updateStatus(job.organization_id, job.channel_id, status.id, status.status as 'sent' | 'delivered' | 'read' | 'failed');
      }
      await queue.done(job.id);
      completed++;
    } catch {
      // Store only attempts/state, never access tokens or message bodies in logs.
      await queue.retry(job.id, job.attempts);
    }
  }
  return { completed };
}
