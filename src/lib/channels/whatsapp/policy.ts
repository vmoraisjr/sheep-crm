export type SendPolicy = {
  consent: boolean;
  optedOut: boolean;
  lastInboundAt: string | null;
  estimatedCost: number;
  remainingBudget: number;
};
export type WhatsAppContent =
  | { type: 'text'; text: string }
  | { type: 'image' | 'audio' | 'video' | 'document'; mediaId: string; caption?: string }
  | { type: 'template'; name: string; language: string; approved: boolean };

export function assertSendAllowed(policy: SendPolicy, content: WhatsAppContent, now = new Date()): void {
  if (!policy.consent || policy.optedOut) throw new Error('consent_required');
  if (!Number.isFinite(policy.estimatedCost) || policy.estimatedCost < 0 || !Number.isFinite(policy.remainingBudget) || policy.estimatedCost > policy.remainingBudget) throw new Error('budget_exceeded');
  const lastInbound = policy.lastInboundAt ? Date.parse(policy.lastInboundAt) : NaN;
  const age = now.getTime() - lastInbound;
  const withinWindow = Number.isFinite(age) && age >= 0 && age < 24 * 60 * 60 * 1000;
  if (content.type === 'template') {
    if (!content.approved || !content.name || !content.language) throw new Error('approved_template_required');
  } else if (!withinWindow) throw new Error('outside_customer_service_window');
  if (content.type === 'text' && (!content.text.trim() || content.text.length > 4096)) throw new Error('invalid_text');
  if (content.type !== 'text' && content.type !== 'template' && !/^[0-9]+$/.test(content.mediaId)) throw new Error('invalid_media_id');
}
