import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectPhotoFormat, detectVoiceFormat, MessageMediaService } from './message-media.service';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);

test('les aperçus téléversés par le radiologue restent partageables sans PACS', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aulia-upload-preview-'));
  const previous = process.env.IMAGING_PREVIEW_UPLOAD_DIR;
  process.env.IMAGING_PREVIEW_UPLOAD_DIR = root;
  try {
    await writeFile(path.join(root, 'preview.jpg'), jpeg);
    const service = new MessageMediaService();
    assert.equal(service.hasPacsPreview(['preview.jpg'], null, null), true);
    assert.equal((await service.openPacsPreview('preview.jpg', null, 'clinic-a')).size, jpeg.length);
  } finally {
    await rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.IMAGING_PREVIEW_UPLOAD_DIR;
    else process.env.IMAGING_PREVIEW_UPLOAD_DIR = previous;
  }
});

test('une photo est reconnue par sa signature et non par son nom', () => {
  assert.equal(detectPhotoFormat(jpeg)?.mimeType, 'image/jpeg');
  assert.equal(detectPhotoFormat(Buffer.from('<svg onload=alert(1)>')), null);
  assert.equal(detectVoiceFormat(webm)?.mimeType, 'audio/webm');
});

test('le stockage refuse un fichier déguisé et supprime les données après échec', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aulia-media-'));
  process.env.MESSAGE_MEDIA_DIR = root;
  const service = new MessageMediaService();
  await assert.rejects(
    service.save({ buffer: Buffer.from('<svg/>'), originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 6 }, 'PHOTO'),
    /Photo refusée/,
  );
  const saved = await service.save({ buffer: jpeg, originalname: 'photo.jpg', mimetype: 'image/jpeg', size: jpeg.length }, 'PHOTO');
  assert.equal(saved.mimeType, 'image/jpeg');
  const opened = await service.open(saved.storageKey);
  assert.equal(opened.size, jpeg.length);
  opened.stream.destroy();
  await service.discard(saved.storageKey);
  await assert.rejects(service.open(saved.storageKey), /disponible/);
  await rm(root, { recursive: true, force: true });
  delete process.env.MESSAGE_MEDIA_DIR;
});

test('une note vocale de plus de deux minutes est refusée', async () => {
  const service = new MessageMediaService();
  await assert.rejects(
    service.save({ buffer: webm, originalname: 'voice.webm', mimetype: 'audio/webm', size: webm.length }, 'VOICE', 120001),
    /2 minutes/,
  );
});

test('un PACS configuré fournit une image contrôlée sans exposer son jeton', async () => {
  const originalFetch = globalThis.fetch;
  process.env.PACS_PREVIEW_URL_TEMPLATE = 'https://pacs.clinic.local/rendered/{studyUid}';
  process.env.PACS_ACCESS_TOKEN = 'secret-test';
  let authorization = '';
  globalThis.fetch = async (_input, init) => {
    authorization = String((init?.headers as Record<string, string>)?.Authorization || '');
    return new Response(jpeg, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  };
  try {
    const service = new MessageMediaService();
    const result = await service.openPacsPreview(undefined, '1.2.3');
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.size, jpeg.length);
    assert.equal(authorization, 'Bearer secret-test');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PACS_PREVIEW_URL_TEMPLATE;
    delete process.env.PACS_ACCESS_TOKEN;
  }
});

test('un aperçu PACS ne peut pas sortir de son répertoire autorisé', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aulia-pacs-'));
  process.env.PACS_PREVIEW_ROOT = root;
  const service = new MessageMediaService();
  await assert.rejects(service.openPacsPreview('../secret.png'), /introuvable/);
  await assert.rejects(service.openPacsPreview('study.dcm'), /aperçu/);
  await rm(root, { recursive: true, force: true });
  delete process.env.PACS_PREVIEW_ROOT;
});
