export type ReplyContext = { status: string; kind: 'whatsapp' | 'instagram'; optedIn: boolean; optedOut: boolean; lastInboundAt: string };
/** Text replies never bypass provider windows. Templates have a separate approved workflow. */
export function assertManualReply(context: ReplyContext, text: string, now = Date.now()) {
  if (!['connected', 'simulated'].includes(context.status)) throw new Error('channel_disconnected');
  if (context.optedOut || (context.kind === 'whatsapp' && !context.optedIn)) throw new Error('consent_required');
  const elapsed = now - Date.parse(context.lastInboundAt);
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 86400000) throw new Error('outside_reply_window');
  if (!text.trim() || text.length > (context.kind === 'instagram' ? 1000 : 4096)) throw new Error('invalid_text');
}
