/** No generative provider is enabled by default. Only approved exact FAQ matches can reply. */
export interface ApprovedKnowledge { id: string; question: string; answer: string; approved: boolean }
export interface AutomationConfig {
  agentApproved: boolean; greeting?: string; outsideHoursReply?: string;
  openHour: number; closeHour: number; timeZone: string;
  maxRepliesPerHour: number; tokenLimit: number; usageLimit: number;
  limitMode: 'soft' | 'hard';
}
export interface AutomationInput {
  organizationId: string; conversationId: string; messageId: string; text: string;
  humanPaused: boolean; optOut: boolean; consent: boolean;
  knowledge: ApprovedKnowledge[]; config: AutomationConfig;
  usedTokens: number; usedReplies: number; repliesThisHour: number;
  firstMessage: boolean; now: Date;
}
export type DecisionReason = 'opt_out' | 'human_priority' | 'not_approved' | 'no_consent' | 'limit' | 'complaint' | 'outside_hours' | 'greeting' | 'approved_faq' | 'unknown';
export interface AutomationDecision {
  action: 'reply' | 'handoff' | 'skip'; reason: DecisionReason; text?: string;
  knowledgeId?: string; tokens: number; costMicros: number;
  provider: 'deterministic'; softLimitReached?: boolean;
}
const normalize = (text: string) => text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{Letter}\p{Number}\s]/gu, '').replace(/\s+/g, ' ').trim();
const decision = (action: AutomationDecision['action'], reason: DecisionReason, text?: string): AutomationDecision => ({ action, reason, ...(text ? { text } : {}), tokens: 0, costMicros: 0, provider: 'deterministic' });
export function decideAutomation(input: AutomationInput): AutomationDecision {
  const text = normalize(input.text);
  if (input.optOut || /\b(parar|sair|cancelar mensagens|stop|nao me envie)\b/.test(text)) return decision('skip', 'opt_out');
  if (input.humanPaused) return decision('skip', 'human_priority');
  if (!input.config.agentApproved) return decision('skip', 'not_approved');
  if (!input.consent) return decision('skip', 'no_consent');
  if (!Number.isFinite(input.config.usageLimit) || input.config.usageLimit < 0 || !Number.isFinite(input.config.maxRepliesPerHour) || input.config.maxRepliesPerHour < 1 || input.repliesThisHour >= input.config.maxRepliesPerHour || input.usedTokens >= input.config.tokenLimit || (input.config.limitMode === 'hard' && input.usedReplies >= input.config.usageLimit)) return decision('handoff', 'limit');
  if (/\b(reclamacao|reclamar|processo|advogado|procon|humano|atendente|reembolso)\b/.test(text)) return decision('handoff', 'complaint');
  let hour: number;
  try { hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: input.config.timeZone, hour: 'numeric', hourCycle: 'h23' }).format(input.now)); } catch { return decision('handoff', 'unknown'); }
  const open = input.config.openHour <= input.config.closeHour ? hour >= input.config.openHour && hour < input.config.closeHour : hour >= input.config.openHour || hour < input.config.closeHour;
  let result: AutomationDecision;
  if (!open && input.config.outsideHoursReply) result = decision('reply', 'outside_hours', input.config.outsideHoursReply);
  else if (input.firstMessage && /^(oi|ola|bom dia|boa tarde|boa noite|hello)$/.test(text) && input.config.greeting) result = decision('reply', 'greeting', input.config.greeting);
  else {
    const faq = input.knowledge.find(item => item.approved && normalize(item.question) === text && item.answer.trim());
    result = faq ? { ...decision('reply', 'approved_faq', faq.answer), knowledgeId: faq.id } : decision('handoff', 'unknown');
  }
  return { ...result, softLimitReached: input.config.limitMode === 'soft' && input.usedReplies >= input.config.usageLimit };
}

/** Port for a future reviewed AI integration. Never used to invent an answer. */
export interface IntentClassifier { readonly mode: 'simulated' | 'real'; classify(text: string): Promise<{ intent: string; tokens: number; costMicros: number }> }
export class SimulatedIntentClassifier implements IntentClassifier {
  readonly mode = 'simulated' as const;
  async classify() { return { intent: 'unknown', tokens: 0, costMicros: 0 }; }
}
