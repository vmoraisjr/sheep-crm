import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!appSecret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

function key(value: string): Buffer {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) throw new Error('Credential key must contain 32 base64-encoded bytes');
  return decoded;
}

/** Tenant binding prevents moving ciphertext between organizations. Never send plaintext to browsers. */
export function encryptCredential(plaintext: string, keyBase64: string, organizationId: string): string {
  if (!organizationId) throw new Error('Tenant is required');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(keyBase64), iv);
  cipher.setAAD(Buffer.from(organizationId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptCredential(encrypted: string, keyBase64: string, organizationId: string): string {
  const [version, iv, tag, ciphertext, extra] = encrypted.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra) throw new Error('Invalid encrypted credential');
  const decipher = createDecipheriv('aes-256-gcm', key(keyBase64), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(organizationId));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
