import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * A 6-digit access code stays visible to the administrators who issue it
 * until its holder has used it (first sign-in, then own password). It is kept
 * encrypted (AES-256-GCM) and erased as soon as it is used or revoked.
 * Key: AULIA_ACCESS_CODE_KEY (32 bytes, base64), otherwise derived from JWT_SECRET.
 */
function vaultKey() {
  const explicit = process.env.AULIA_ACCESS_CODE_KEY;
  if (explicit) {
    const key = Buffer.from(explicit, 'base64');
    if (key.length === 32) return key;
    throw new Error('AULIA_ACCESS_CODE_KEY doit contenir exactement 32 octets encodés en base64.');
  }
  // In production the codes have their own key: rotating the session secret
  // must not make them unreadable, and a leaked session secret must not reveal them.
  if (process.env.NODE_ENV === 'production') throw new Error('AULIA_ACCESS_CODE_KEY est obligatoire en production (32 octets, base64).');
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET (ou AULIA_ACCESS_CODE_KEY) est requis pour conserver les codes d’accès.');
  return createHash('sha256').update(`aulia-access-code:${secret}`).digest();
}

export function sealAccessCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const data = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}

export function openAccessCode(sealed: string): string | null {
  try {
    const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', vaultKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
