import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { afterEach, test } from 'node:test';

import { assertAccessCodeKeyConfigured, openAccessCode, openAccessCodeDetailed, sealAccessCode } from './access-code-vault';

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

function legacySeal(code: string, jwtSecret: string) {
  const key = createHash('sha256').update(`aulia-access-code:${jwtSecret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${data.toString('base64')}`;
}

test('un code scellé avant la clé dédiée reste lisible après la mise à jour et est signalé à resceller', () => {
  process.env.JWT_SECRET = 'ancien-secret-de-session';
  const sealed = legacySeal('482913', 'ancien-secret-de-session');
  process.env.AULIA_ACCESS_CODE_KEY = randomBytes(32).toString('base64');
  process.env.NODE_ENV = 'production';
  assert.deepEqual(openAccessCodeDetailed(sealed), { code: '482913', legacy: true });
});

test('un nouveau code utilise la clé dédiée, pas la clé dérivée de la session', () => {
  process.env.JWT_SECRET = 'secret-session';
  process.env.AULIA_ACCESS_CODE_KEY = randomBytes(32).toString('base64');
  const sealed = sealAccessCode('105577');
  assert.deepEqual(openAccessCodeDetailed(sealed), { code: '105577', legacy: false });
  delete process.env.AULIA_ACCESS_CODE_KEY;
  assert.equal(openAccessCode(sealed), null);
});

test('en production, une clé absente bloque le démarrage', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'secret-session';
  delete process.env.AULIA_ACCESS_CODE_KEY;
  assert.throws(() => assertAccessCodeKeyConfigured(), /AULIA_ACCESS_CODE_KEY est obligatoire/);
});

test('une clé de mauvaise longueur est refusée au démarrage', () => {
  process.env.AULIA_ACCESS_CODE_KEY = Buffer.from('trop-courte').toString('base64');
  assert.throws(() => assertAccessCodeKeyConfigured(), /32 octets/);
});

test('un code scellé avec une autre clé reste illisible', () => {
  process.env.JWT_SECRET = 'secret-session';
  process.env.AULIA_ACCESS_CODE_KEY = randomBytes(32).toString('base64');
  const sealed = sealAccessCode('300001');
  process.env.AULIA_ACCESS_CODE_KEY = randomBytes(32).toString('base64');
  process.env.JWT_SECRET = 'autre';
  assert.equal(openAccessCode(sealed), null);
});
