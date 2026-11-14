import { describe, expect, it, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { createState, readState, encryptToken, decryptToken, verifySignature } from '../src/lib/channels/instagram/security';
import { normalizeInstagram } from '../src/lib/channels/instagram/webhook';
import { InstagramClient } from '../src/lib/channels/instagram/client';
const config = { appId: 'app', appSecret: 'secret', redirectUri: 'https://example.org/callback', graphVersion: 'v24.0' };
describe('Instagram official boundaries (provider calls are simulated)', () => {
 it('binds OAuth state to session, expiration and signature', () => {
  const secret = 's'.repeat(32), state = createState('org-a', 'user-a', secret, 1000);
  expect(readState(state, secret, 'user-a', 1001).organizationId).toBe('org-a');
  expect(() => readState(state, secret, 'user-b', 1001)).toThrow();
  expect(() => readState(state, secret, 'user-a', 601000)).toThrow();
  expect(() => readState(state+'x', secret, 'user-a', 1001)).toThrow();
 });
 it('encrypts credentials with tenant AAD and rejects tamper', () => {
  const key = randomBytes(32).toString('base64'), encrypted = encryptToken('private-token',key,'a');
  expect(encrypted).not.toContain('private-token'); expect(decryptToken(encrypted,key,'a')).toBe('private-token');
  expect(() => decryptToken(encrypted,key,'b')).toThrow();
  expect(() => decryptToken('invalid',key,'a')).toThrow();
 });
 it('authenticates exact raw webhook bytes', () => {
  const body = '{"object":"instagram"}', signature = `sha256=${createHmac('sha256','secret').update(body).digest('hex')}`;
  expect(verifySignature(body,signature,'secret')).toBe(true);
  expect(verifySignature(body+' ',signature,'secret')).toBe(false);
  expect(verifySignature(body,null,'secret')).toBe(false);
 });
 it('routes only persisted account, ignores echo and normalizes shared inbox events', () => {
  const context = { organizationId:'a',channelId:'channel',accountId:'account' };
  const event = { sender:{id:'customer'},recipient:{id:'account'},timestamp:1700000000000,message:{mid:'m1',text:'Oi'} };
  const normalized = normalizeInstagram({ object:'instagram',entry:[{id:'account',messaging:[event,{...event,message:{...event.message,is_echo:true}}]},{id:'other',messaging:[event]}]},context);
  expect(normalized.messages).toHaveLength(1); expect(normalized.messages[0]).toMatchObject({ organizationId:'a',channelKind:'instagram',providerMessageId:'m1',origin:'meta' });
 });
 it('uses official endpoint and blocks opt-out/outside window without any network call', async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message_id:'real-shape-only' }),{status:200}));
  const client = new InstagramClient(config,request);
  const base = { accountId:'account',recipientId:'customer',text:'Oi',token:'secret',lastInboundAt:new Date().toISOString(),optedOut:false };
  await expect(client.send({...base,optedOut:true})).rejects.toThrow();
  await expect(client.send({...base,lastInboundAt:'2020-01-01'})).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  expect(await client.send(base)).toMatchObject({providerMessageId:'real-shape-only',origin:'meta'});
  expect(request.mock.calls[0][0]).toBe('https://graph.instagram.com/v24.0/account/messages');
 });
 it('sanitizes errors without leaking provider response credentials', async () => {
  const client = new InstagramClient(config,vi.fn().mockResolvedValue(new Response('private-token',{status:401})));
  await expect(client.account('private-token')).rejects.toThrow('unauthorized');
 });
 it('requires professional eligibility and explicit Graph version', async () => {
  const client = new InstagramClient(config,vi.fn().mockResolvedValue(Response.json({user_id:'id',username:'name',account_type:'PERSONAL'})));
  await expect(client.account('secret')).rejects.toThrow('eligibility');
  expect(() => new InstagramClient({...config,graphVersion:'latest'})).toThrow();
 });
});
