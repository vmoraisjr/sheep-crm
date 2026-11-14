import { describe, expect, it } from 'vitest';
import { demoConversations, filterConversations, manualReply } from '../src/lib/demo/inbox';
describe('unified inbox simulation', () => {
  it('filters channels, unanswered and case-insensitive message search', () => {
    expect(filterConversations(demoConversations, 'instagram', '')).toHaveLength(1);
    expect(filterConversations(demoConversations, 'unanswered', '')).toHaveLength(2);
    expect(filterConversations(demoConversations, 'all', 'SERVIÇOS')[0].name).toBe('Marina Oliveira');
  });
  it('manual intervention clears unanswered, pauses AI and is explicitly simulated', () => {
    const result = manualReply(demoConversations[0], ' Teste ', 'out-1', new Date().toISOString());
    expect(result.unread).toBe(false); expect(result.aiPaused).toBe(true);
    expect(result.messages.at(-1)).toMatchObject({ text:'Teste', origin:'simulated', status:'simulado' });
    expect(demoConversations[0].messages).toHaveLength(1);
  });
  it('rejects empty and oversized outbound messages', () => {
    expect(() => manualReply(demoConversations[0], ' ', 'id', '')).toThrow();
    expect(() => manualReply(demoConversations[0], 'x'.repeat(4097), 'id', '')).toThrow();
  });
});
import { assertManualReply } from '../src/lib/inbox/reply';
it('manual replies obey channel connection, opt-out and 24h windows for both providers', () => {
 const policy={status:'connected',kind:'whatsapp' as const,optedIn:true,optedOut:false,lastInboundAt:new Date(100000000).toISOString()};
 expect(()=>assertManualReply(policy,'Hello',100000001)).not.toThrow();
 expect(()=>assertManualReply({...policy,status:'disconnected'},'Hello',100000001)).toThrow();
 expect(()=>assertManualReply({...policy,optedOut:true},'Hello',100000001)).toThrow();
 expect(()=>assertManualReply({...policy,kind:'instagram'},'Hello',100000000+86400000)).toThrow();
});
