import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * A 6-digit access code stays visible to the administrators who issue it
 * until its holder has used it (first sign-in, then own password). It is kept
 * encrypted (AES-256-GCM) and erased as soon as it is used or revoked.
 *
 * Key: AULIA_ACCESS_CODE_KEY (32 bytes, base64); mandatory in production.
 * Codes sealed before that key existed were derived from JWT_SECRET: they are
 * still opened with that legacy key (read only, never used to seal), so an
 * upgrade does not make pending codes unreadable. `npm run
 * maintenance:reseal-access-codes` re-encrypts them with the dedicated key.
 */
function explicitKey(): Buffer | null {
  const explicit = process.env.AULIA_ACCESS_CODE_KEY;
  if (!explicit) return null;
  const key = Buffer.from(explicit, 'base64');
  if (key.length !== 32) throw new Error('AULIA_ACCESS_CODE_KEY doit contenir exactement 32 octets encodés en base64.');
  return key;
}

function legacyKey(): Buffer | null {
  const secret = process.env.JWT_SECRET;
  return secret ? createHash('sha256').update(`aulia-access-code:${secret}`).digest() : null;
}

function sealingKey(): Buffer {
  const key = explicitKey();
  if (key) return key;
  if (process.env.NODE_ENV === 'production') throw new Error('AULIA_ACCESS_CODE_KEY est obligatoire en production (32 octets, base64).');
  const legacy = legacyKey();
  if (!legacy) throw new Error('JWT_SECRET (ou AULIA_ACCESS_CODE_KEY) est requis pour conserver les codes d’accès.');
  return legacy;
}

/** Called at boot: a misconfigured key fails at start-up, not at the first account creation. */
export function assertAccessCodeKeyConfigured() {
  sealingKey();
}

export function sealAccessCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sealingKey(), iv);
  const data = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}

function tryOpen(sealed: string, key: Buffer): string | null {
  try {
    const [iv, tag, data] = sealed.split('.').map((part) => Buffer.from(part, 'base64'));
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Opens a code and tells whether it still uses the legacy key (to be resealed). */
export function openAccessCodeDetailed(sealed: string): { code: string; legacy: boolean } | null {
  const primary = explicitKey();
  if (primary) {
    const code = tryOpen(sealed, primary);
    if (code !== null) return { code, legacy: false };
  }
  const legacy = legacyKey();
  if (legacy) {
    const code = tryOpen(sealed, legacy);
    if (code !== null) return { code, legacy: primary !== null };
  }
  return null;
}

export function openAccessCode(sealed: string): string | null {
  return openAccessCodeDetailed(sealed)?.code ?? null;
}
