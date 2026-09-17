import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'v1';

function encryptionKey(): Buffer {
  const secret = process.env.LLM_KEY_ENCRYPTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('LLM_KEY_ENCRYPTION_SECRET or SUPABASE_SERVICE_ROLE_KEY is required to store API keys');
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error('Stored API key is unreadable. Save a new key.');
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64!, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function secretLast4(plain: string): string {
  const trimmed = plain.trim();
  return trimmed.slice(-4);
}
