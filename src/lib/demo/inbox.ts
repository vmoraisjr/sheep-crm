/** Browser-only fixtures. Never used as a production repository. */
export type InboxChannel = 'whatsapp' | 'instagram';
export type InboxMessage = { id: string; text: string; direction: 'inbound' | 'outbound'; at: string; origin: 'simulated' | 'meta'; status?: string };
export type InboxConversation = { id: string; contactId: string; name: string; channel: InboxChannel; unread: boolean; aiPaused: boolean; assignee: string; handoff: string; opportunity?: {stage: string; nextAction: string; tags: string[]}; messages: InboxMessage[] };
export const demoConversations: InboxConversation[] = [
  { id: 'demo-wa-1', contactId: 'demo-contact-1', name: 'Marina Oliveira', channel: 'whatsapp', unread: true, aiPaused: false, assignee: '', handoff: '', messages: [{ id: 'demo-m-1', text: 'Olá! Gostaria de saber mais sobre os serviços.', direction: 'inbound', at: '2026-11-14T13:00:00Z', origin: 'simulated' }] },
  { id: 'demo-ig-1', contactId: 'demo-contact-2', name: 'João Santos', channel: 'instagram', unread: true, aiPaused: true, assignee: 'Equipe comercial', handoff: 'Cliente pediu atendimento humano. Confirmar suas necessidades antes de apresentar uma proposta.', messages: [{ id: 'demo-m-2', text: 'Posso conversar com uma pessoa?', direction: 'inbound', at: '2026-11-14T12:30:00Z', origin: 'simulated' }] },
  { id: 'demo-wa-2', contactId: 'demo-contact-3', name: 'Ana Lima', channel: 'whatsapp', unread: false, aiPaused: true, assignee: 'Equipe comercial', handoff: '', messages: [{ id: 'demo-m-3', text: 'Obrigada pelo atendimento!', direction: 'inbound', at: '2026-11-14T11:00:00Z', origin: 'simulated' }, { id: 'demo-m-4', text: 'Estamos à disposição.', direction: 'outbound', at: '2026-11-14T11:01:00Z', origin: 'simulated', status: 'simulado' }] },
];
export function filterConversations(items: InboxConversation[], channel: string, query: string) {
  return items.filter((item) => (channel === 'all' || (channel === 'unanswered' ? item.unread : item.channel === channel)) && `${item.name} ${item.messages.map((message) => message.text).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
}
export function manualReply(item: InboxConversation, text: string, id: string, at: string): InboxConversation {
  const clean = text.trim();
  if (!clean || clean.length > 4096) throw new Error('A resposta deve ter entre 1 e 4096 caracteres.');
  return { ...item, unread: false, aiPaused: true, messages: [...item.messages, { id, text: clean, direction: 'outbound', at, origin: 'simulated', status: 'simulado' }] };
}
