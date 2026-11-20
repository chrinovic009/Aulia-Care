import assert from 'node:assert/strict';
import test from 'node:test';
import { PacsConfigService, openPacsToken, sealPacsToken, validatePacsUrl } from './pacs-config.service';
import { MessageMediaService } from '../messages/message-media.service';

test('PACS credentials are authenticated and bound to their clinic', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'synthetic-pacs-test-key';
  try {
    const sealed = sealPacsToken('synthetic-token', 'clinic-a');
    assert.equal(sealed.includes('synthetic-token'), false);
    assert.equal(openPacsToken(sealed, 'clinic-a'), 'synthetic-token');
    assert.throws(() => openPacsToken(sealed, 'clinic-b'));
  } finally { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
});

test('only an active unassigned platform developer can configure clinic PACS', async () => {
  for (const actor of [null, { primaryRole: 'PHYSICIAN', status: 'ACTIVE', deletedAt: null, clinicId: 'a' }, { primaryRole: 'DEV', status: 'SUSPENDED', deletedAt: null, clinicId: null }, { primaryRole: 'DEV', status: 'ACTIVE', deletedAt: null, clinicId: 'a' }]) {
    const service = new PacsConfigService({ user: { findUnique: async () => actor } } as never);
    await assert.rejects(service.metadata('actor', 'clinic-a'), /développeur plateforme/);
  }
});

test('PACS configuration rejects embedded credentials, insecure URLs and metadata destinations', () => {
  for (const url of ['http://pacs.local/{studyUid}', 'https://a:b@pacs.local/{studyUid}', 'https://pacs.local/no-uid', 'https://pacs.local/{studyUid}?token=secret', 'https://169.254.169.254/{studyUid}', 'https://localhost/{studyUid}']) assert.throws(() => validatePacsUrl(url));
  assert.equal(validatePacsUrl('https://pacs.clinic.local/rendered/{studyUid}'), 'https://pacs.clinic.local/rendered/{studyUid}');
});

test('tenant-aware previews never use another clinics global token', async () => {
  const originalFetch = globalThis.fetch;
  const previous = process.env.PACS_PREVIEW_URL_TEMPLATE;
  process.env.PACS_PREVIEW_URL_TEMPLATE = 'https://global.invalid/{studyUid}';
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; throw new Error('not expected'); };
  try {
    const media = new MessageMediaService({ resolve: async () => null } as never);
    await assert.rejects(media.openPacsPreview(undefined, '1.2.3', 'clinic-b'));
    assert.equal(fetched, false);
    assert.equal(await media.hasClinicPacsPreview('clinic-b', [], '1.2.3'), false);
  } finally { globalThis.fetch = originalFetch; if (previous === undefined) delete process.env.PACS_PREVIEW_URL_TEMPLATE; else process.env.PACS_PREVIEW_URL_TEMPLATE = previous; }
});