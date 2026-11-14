import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function key(value: string) {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 32) throw new Error('INSTAGRAM_ENCRYPTION_KEY must contain 32 random bytes in base64');
  return bytes;
}
export function encryptToken(token: string, secret: string, organizationId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(organizationId));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString('base64url')).join('.');
}
export function decryptToken(token: string, secret: string, organizationId: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted token');
  const [iv, tag, ciphertext] = parts.map(v => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(organizationId));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString('utf8');
}
export function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
export interface OAuthState { organizationId: string; userId: string; nonce: string; expiresAt: number }
export function createState(organizationId: string, userId: string, secret: string, now = Date.now()): string {
  if (secret.length < 32) throw new Error('OAuth state secret must contain at least 32 characters');
  const payload = Buffer.from(JSON.stringify({ organizationId, userId, nonce: randomBytes(24).toString('hex'), expiresAt: now + 600_000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function readState(value: string, secret: string, userId: string, now = Date.now()): OAuthState {
  if (secret.length < 32 || value.length > 4096) throw new Error('Invalid OAuth state');
  const [payload, signature, extra] = value.split('.');
  const expected = createHmac('sha256', secret).update(payload || '').digest();
  const supplied = Buffer.from(signature || '', 'base64url');
  if (extra || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw new Error('Invalid OAuth state');
  const state: OAuthState = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (state.userId !== userId || !state.organizationId || !state.nonce || !Number.isFinite(state.expiresAt) || state.expiresAt <= now || state.expiresAt > now + 600_000) throw new Error('Expired or mismatched OAuth state');
  return state;
}
