import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { detectPhotoFormat, PHOTO_MAX_BYTES } from '../common/media/image-file';
import type { MediaUpload } from '../messages/message-media.service';

@Injectable()
export class ImagingPreviewService {
  private readonly uploadRoot = path.resolve(process.env.IMAGING_PREVIEW_UPLOAD_DIR || path.join(process.cwd(), 'storage', 'imaging-previews'));
  private readonly pacsRoot = process.env.PACS_PREVIEW_ROOT ? path.resolve(process.env.PACS_PREVIEW_ROOT) : null;

  async save(upload: MediaUpload | undefined) {
    if (!upload?.buffer?.length || upload.size !== upload.buffer.length) {
      throw new BadRequestException('L’aperçu est vide ou incomplet.');
    }
    if (upload.buffer.length > PHOTO_MAX_BYTES) {
      throw new BadRequestException('L’aperçu ne doit pas dépasser 8 Mo.');
    }
    const format = detectPhotoFormat(upload.buffer);
    if (!format) {
      throw new BadRequestException('Aperçu refusé : utilisez une image JPEG, PNG ou WebP valide.');
    }
    const storageKey = `${randomUUID()}.${format.extension}`;
    await mkdir(this.uploadRoot, { recursive: true, mode: 0o700 });
    await writeFile(this.safePath(this.uploadRoot, storageKey), upload.buffer, { flag: 'wx', mode: 0o600 });
    return { storageKey };
  }

  async open(storageKey: string) {
    const roots = this.pacsRoot ? [this.uploadRoot, this.pacsRoot] : [this.uploadRoot];
    for (const root of roots) {
      const filePath = this.safePath(root, storageKey);
      const details = await stat(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!details) continue;
      if (!details.isFile() || details.size > PHOTO_MAX_BYTES) {
        throw new NotFoundException('Aperçu radiologique invalide ou supérieur à 8 Mo.');
      }
      const buffer = await readFile(filePath);
      const extension = path.extname(storageKey).toLowerCase();
      const expectedMime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
        : extension === '.png' ? 'image/png'
          : extension === '.webp' ? 'image/webp' : null;
      const format = detectPhotoFormat(buffer);
      if (!expectedMime || format?.mimeType !== expectedMime) {
        throw new NotFoundException('Le contenu de l’aperçu radiologique est invalide.');
      }
      return { stream: Readable.from(buffer), size: buffer.length, mimeType: format.mimeType };
    }
    throw new NotFoundException('Aperçu radiologique introuvable.');
  }

  async discard(storageKey: string) {
    try {
      await unlink(this.safePath(this.uploadRoot, storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private safePath(root: string, candidate: string) {
    if (!candidate || candidate.includes('\0')) throw new NotFoundException('Aperçu radiologique introuvable.');
    const resolved = path.resolve(root, candidate);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new NotFoundException('Aperçu radiologique introuvable.');
    }
    return resolved;
  }
}
