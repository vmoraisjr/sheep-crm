import { decideAutomation, type AutomationDecision, type AutomationInput } from './engine';

export interface AutomationRepository {
  /** Atomic tenant/message claim, unique even under concurrent deliveries. */
  claim(organizationId: string, messageId: string): Promise<boolean>;
  loadInput(organizationId: string, conversationId: string, messageId: string): Promise<AutomationInput>;
  /** Transaction rechecks pause/optout/approval/budget, audits and queues, never sends inline. */
  commit(input: AutomationInput, decision: AutomationDecision): Promise<AutomationDecision>;
  fail(organizationId: string, messageId: string): Promise<void>;
}
export async function runAutomation(repository: AutomationRepository, organizationId: string, conversationId: string, messageId: string) {
  if (!await repository.claim(organizationId, messageId)) return { duplicate: true as const };
  try {
    const input = await repository.loadInput(organizationId, conversationId, messageId);
    if (input.organizationId !== organizationId || input.conversationId !== conversationId || input.messageId !== messageId) throw new Error('Tenant or message mismatch');
    return { duplicate: false as const, decision: await repository.commit(input, decideAutomation(input)) };
  } catch (error) { await repository.fail(organizationId, messageId); throw error; }
}
