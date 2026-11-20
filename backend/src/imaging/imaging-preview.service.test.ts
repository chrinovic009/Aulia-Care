import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ImagingPreviewService } from './imaging-preview.service';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

test('imaging previews are privately stored, validated and contained', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aulia-imaging-preview-unit-'));
  const previousRoot = process.env.IMAGING_PREVIEW_UPLOAD_DIR;
  const previousPacs = process.env.PACS_PREVIEW_ROOT;
  process.env.IMAGING_PREVIEW_UPLOAD_DIR = root;
  delete process.env.PACS_PREVIEW_ROOT;
  try {
    const service = new ImagingPreviewService();
    const saved = await service.save({ buffer: png, originalname: 'thorax.png', mimetype: 'image/png', size: png.length });
    assert.match(saved.storageKey, /^[0-9a-f-]+\.png$/);
    const opened = await service.open(saved.storageKey);
    assert.equal(opened.mimeType, 'image/png');
    assert.equal(opened.size, png.length);
    await assert.rejects(
      service.save({ buffer: Buffer.from('not-an-image'), originalname: 'fake.png', mimetype: 'image/png', size: 12 }),
      BadRequestException,
    );
    await assert.rejects(service.open('../outside.png'), NotFoundException);
    await service.discard(saved.storageKey);
    await assert.rejects(service.open(saved.storageKey), NotFoundException);
  } finally {
    if (previousRoot === undefined) delete process.env.IMAGING_PREVIEW_UPLOAD_DIR;
    else process.env.IMAGING_PREVIEW_UPLOAD_DIR = previousRoot;
    if (previousPacs === undefined) delete process.env.PACS_PREVIEW_ROOT;
    else process.env.PACS_PREVIEW_ROOT = previousPacs;
    await rm(root, { recursive: true, force: true });
  }
});
