import { describe, expect, it } from 'vitest';
import { MemoryDomainRepository } from '../src/lib/domain/memory-repository';
import { SimulatedChannelAdapter } from '../src/lib/domain/simulated-adapter';
import { SupabaseDomainRepository } from '../src/lib/domain/supabase-repository';
import type { NormalizedInbound } from '../src/lib/domain/types';
import type { SupabaseClient } from '@supabase/supabase-js';
const event: NormalizedInbound = { organizationId:'tenant-a',channelId:'wa-a',channelKind:'whatsapp',providerMessageId:'provider-1',externalContactId:'contact-1',text:'Olá',occurredAt:'2026-11-14T10:00:00.000Z',origin:'simulated' };
describe('tenant-aware domain and adapters', () => {
  it('ingests retries concurrently only once and preserves provider timestamp/origin', async () => {
    const repo = new MemoryDomainRepository();
    const results = await Promise.all(Array.from({length:10},()=>repo.ingest(event)));
    expect(results.filter(row=>!row.duplicate)).toHaveLength(1);
    expect(await repo.listMessages('tenant-a',results[0].conversation.id)).toHaveLength(1);
    expect(results[0].message).toMatchObject({occurredAt:event.occurredAt,origin:'simulated'});
  });
  it('isolates tenants and channels even when provider IDs collide', async () => {
    const repo = new MemoryDomainRepository();
    const a = await repo.ingest(event);
    const b = await repo.ingest({...event,organizationId:'tenant-b'});
    const ig = await repo.ingest({...event,channelId:'ig-a',channelKind:'instagram'});
    expect(a.contact.id).not.toBe(b.contact.id);
    expect(a.contact.id).not.toBe(ig.contact.id);
    expect(await repo.listMessages('tenant-b',a.conversation.id)).toEqual([]);
    expect(await repo.listConversations('tenant-a')).toHaveLength(2);
  });
  it('rejects missing IDs, malformed timestamps and empty messages', async () => {
    const repo = new MemoryDomainRepository();
    await expect(repo.ingest({...event,providerMessageId:''})).rejects.toThrow();
    await expect(repo.ingest({...event,occurredAt:'yesterday'})).rejects.toThrow();
    await expect(repo.ingest({...event,text:''})).rejects.toThrow();
  });
  it('does not allow mutation of stored objects by callers or older delivery to move time back', async () => {
    const repo = new MemoryDomainRepository();
    const result = await repo.ingest(event); result.contact.name='tampered';
    const older = await repo.ingest({...event,providerMessageId:'older',occurredAt:'2026-11-13T10:00:00.000Z'});
    expect(older.contact.name).toBe('contact-1'); expect(older.conversation.lastInboundAt).toBe(event.occurredAt);
  });
  it('simulated adapters normalize both channels and identify every send as simulated', async () => {
    for (const channelKind of ['whatsapp','instagram'] as const) {
      const adapter = new SimulatedChannelAdapter(channelKind);
      const normalized = adapter.normalize({id:'1',from:'sender',text:'Oi',timestamp:event.occurredAt},{organizationId:'a',channelId:'c',channelKind});
      expect(normalized[0]).toMatchObject({origin:'simulated',channelKind});
      const send = {organizationId:'a',channelId:'c',recipientId:'sender',text:'Olá',idempotencyKey:'key'};
      expect(await adapter.send(send)).toEqual(await adapter.send(send));
      expect((await adapter.send(send)).origin).toBe('simulated');
    }
  });
  it('server repository rejects a different tenant before calling the database', async () => {
    const repo = new SupabaseDomainRepository({} as SupabaseClient,'tenant-a');
    await expect(repo.ingest({...event,organizationId:'tenant-b'})).rejects.toThrow('Tenant mismatch');
    await expect(repo.listConversations('tenant-b')).rejects.toThrow('Tenant mismatch');
    await expect(repo.listMessages('tenant-b','id')).rejects.toThrow('Tenant mismatch');
  });
});
