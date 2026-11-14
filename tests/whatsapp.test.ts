import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { encryptCredential, decryptCredential, verifyMetaSignature } from '../src/lib/channels/security';
import { WhatsAppCloudAdapter, MetaApiError, SimulatedWhatsAppAdapter } from '../src/lib/channels/whatsapp/client';
import { assertSendAllowed } from '../src/lib/channels/whatsapp/policy';
import { extractWhatsAppEvents, normalizeWhatsAppMessage, receiveWhatsAppWebhook, verifyChallenge } from '../src/lib/channels/whatsapp/webhook';
import { processWhatsAppJobs } from '../src/lib/channels/whatsapp/worker';
const now = new Date('2026-11-14T12:00:00Z');
const policy = { consent: true, optedOut: false, lastInboundAt: now.toISOString(), estimatedCost: 1, remainingBudget: 5 };
const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, contacts: [{ wa_id: '5511999999999', profile: { name: 'Ana' } }], messages: [{ id: 'wamid.1', from: '5511999999999', timestamp: '1794657600', type: 'text', text: { body: 'Olá' } }] } }] }] };
describe('official WhatsApp boundary', () => {
  it('validates exact raw bytes and rejects spoofed signatures', () => {
    const raw = JSON.stringify(payload); const signature = 'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    expect(verifyMetaSignature(raw, signature, 'secret')).toBe(true);
    expect(verifyMetaSignature(raw + ' ', signature, 'secret')).toBe(false);
    expect(verifyMetaSignature(raw, 'sha256=bad', 'secret')).toBe(false);
  });
  it('only accepts configured challenge token and mode', () => {
    expect(verifyChallenge(new URL('https://local?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=123'), 'abc')).toBe('123');
    expect(verifyChallenge(new URL('https://local?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=123'), 'abc')).toBe(null);
  });
  it('binds encrypted credentials to the tenant and detects tampering', () => {
    const key = Buffer.alloc(32, 1).toString('base64'); const encrypted = encryptCredential('token', key, 'tenant-a');
    expect(encrypted).not.toContain('token'); expect(decryptCredential(encrypted, key, 'tenant-a')).toBe('token');
    expect(() => decryptCredential(encrypted, key, 'tenant-b')).toThrow();
    expect(() => decryptCredential(encrypted + 'x', key, 'tenant-a')).toThrow();
  });
  it('normalizes official payload and preserves provider identity', () => {
    const events = extractWhatsAppEvents(payload);
    expect(events[0].eventKey).toBe('message:wamid.1');
    expect(normalizeWhatsAppMessage(events[0].payload, { organizationId: 'a', channelId: 'c', channelKind: 'whatsapp' })).toMatchObject({ organizationId: 'a', externalContactId: '5511999999999', contactName: 'Ana', text: 'Olá', providerMessageId: 'wamid.1', origin: 'meta' });
  });
  it('never acknowledges before durable enqueue and rejects unauthenticated events', async () => {
    const raw = JSON.stringify(payload); const sig = 'sha256=' + createHmac('sha256', 'secret').update(raw).digest('hex');
    const enqueue = vi.fn(async () => { throw new Error('offline'); });
    expect(await receiveWhatsAppWebhook(raw, null, 'secret', enqueue)).toBe(401); expect(enqueue).not.toHaveBeenCalled();
    expect(await receiveWhatsAppWebhook(raw, sig, 'secret', enqueue)).toBe(503);
    expect(await receiveWhatsAppWebhook(raw, sig, 'secret', async () => {})).toBe(200);
  });
  it('enforces consent, optout, 24-hour boundary, template approval, and cost', () => {
    const text = { type: 'text' as const, text: 'Olá' };
    for (const patch of [{ consent: false }, { optedOut: true }, { lastInboundAt: '2026-11-13T12:00:00Z' }, { lastInboundAt: '2026-11-15T12:00:00Z' }, { remainingBudget: 0 }]) expect(() => assertSendAllowed({ ...policy, ...patch }, text, now)).toThrow();
    expect(() => assertSendAllowed({ ...policy, lastInboundAt: null }, { type: 'template', name: 'hello', language: 'pt_BR', approved: true }, now)).not.toThrow();
    expect(() => assertSendAllowed(policy, { type: 'template', name: 'hello', language: 'pt_BR', approved: false }, now)).toThrow('approved_template_required');
  });
  it('uses only official Graph endpoint and does not retry ambiguous outbound requests', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ messages: [{ id: 'wamid.real' }] }));
    const adapter = new WhatsAppCloudAdapter({ phoneNumberId: '123', accessToken: 'secret', graphVersion: 'v25.0' }, request);
    expect(await adapter.send('5511999999999', { type: 'text', text: 'Olá' }, policy, now)).toEqual({ providerMessageId: 'wamid.real', mode: 'official' });
    expect(request.mock.calls[0][0]).toBe('https://graph.facebook.com/v25.0/123/messages');
    const failing = new WhatsAppCloudAdapter({ phoneNumberId: '123', accessToken: 'secret', graphVersion: 'v25.0' }, async () => Response.json({ error: { code: 130429 } }, { status: 429 }));
    await expect(failing.send('5511999999999', { type: 'text', text: 'Olá' }, policy, now)).rejects.toBeInstanceOf(MetaApiError);
  });
  it('labels simulated sends explicitly', async () => {
    expect((await new SimulatedWhatsAppAdapter().send('5511999999999', { type: 'text', text: 'Olá' }, policy, now)).mode).toBe('simulated');
  });
  it('worker acknowledges after domain ingest and retries failures', async () => {
    const events = extractWhatsAppEvents(payload);
    const queue = { claim: async () => [{ id: 1, organization_id: 'a', channel_id: 'c', payload: events[0].payload, attempts: 1 }], done: vi.fn(async () => {}), retry: vi.fn(async () => {}), updateStatus: vi.fn(async () => {}) };
    const repository = { ingest: vi.fn(async () => { throw new Error('offline'); }), listConversations: async () => [], listMessages: async () => [] };
    expect(await processWhatsAppJobs(queue, () => repository)).toEqual({ completed: 0 });
    expect(queue.done).not.toHaveBeenCalled(); expect(queue.retry).toHaveBeenCalledWith(1, 1);
  });
});
