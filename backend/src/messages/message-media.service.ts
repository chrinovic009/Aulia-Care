import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createReadStream, ReadStream } from 'fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

import { detectPhotoFormat, PHOTO_MAX_BYTES } from '../common/media/image-file';
import { PacsConfigService } from '../pacs/pacs-config.service';

export { detectPhotoFormat, PHOTO_MAX_BYTES } from '../common/media/image-file';

export const VOICE_MAX_BYTES = 12 * 1024 * 1024;
export const VOICE_MAX_DURATION_MS = 120_000;

export interface MediaUpload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

type VoiceFormat = { extension: 'webm' | 'ogg' | 'm4a' | 'wav'; mimeType: 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/wav' };

export function detectVoiceFormat(buffer: Buffer): VoiceFormat | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { extension: 'webm', mimeType: 'audio/webm' };
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    return { extension: 'ogg', mimeType: 'audio/ogg' };
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { extension: 'm4a', mimeType: 'audio/mp4' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') {
    return { extension: 'wav', mimeType: 'audio/wav' };
  }
  return null;
}

@Injectable()
export class MessageMediaService {
  constructor(private readonly pacs?: PacsConfigService) {}
  private readonly root = path.resolve(process.env.MESSAGE_MEDIA_DIR || path.join(process.cwd(), 'storage', 'message-media'));
  private readonly pacsPreviewRoot = process.env.PACS_PREVIEW_ROOT ? path.resolve(process.env.PACS_PREVIEW_ROOT) : null;
  private readonly pacsPreviewUrlTemplate = process.env.PACS_PREVIEW_URL_TEMPLATE?.trim() || null;
  private readonly pacsAccessToken = process.env.PACS_ACCESS_TOKEN?.trim() || null;

  async save(upload: MediaUpload, kind: 'PHOTO' | 'VOICE', durationMs?: number) {
    if (!upload?.buffer?.length || upload.size !== upload.buffer.length) {
      throw new BadRequestException('Le fichier est vide ou incomplet.');
    }
    const format = kind === 'PHOTO' ? detectPhotoFormat(upload.buffer) : detectVoiceFormat(upload.buffer);
    if (!format) {
      throw new BadRequestException(kind === 'PHOTO'
        ? 'Photo refusée : utilisez une image JPEG, PNG ou WebP valide.'
        : 'Note vocale refusée : utilisez un enregistrement WebM, Ogg, M4A ou WAV valide.');
    }
    const maxBytes = kind === 'PHOTO' ? PHOTO_MAX_BYTES : VOICE_MAX_BYTES;
    if (upload.buffer.length > maxBytes) {
      throw new BadRequestException(kind === 'PHOTO' ? 'La photo ne doit pas dépasser 8 Mo.' : 'La note vocale ne doit pas dépasser 12 Mo.');
    }
    if (kind === 'VOICE' && (!Number.isInteger(durationMs) || Number(durationMs) < 250 || Number(durationMs) > VOICE_MAX_DURATION_MS)) {
      throw new BadRequestException('La note vocale doit durer entre 0,25 seconde et 2 minutes.');
    }

    const storageKey = `${randomUUID()}.${format.extension}`;
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await writeFile(this.safePath(this.root, storageKey), upload.buffer, { flag: 'wx', mode: 0o600 });
    return {
      storageKey,
      originalName: path.basename(upload.originalname || storageKey).slice(0, 180),
      mimeType: format.mimeType,
      sizeBytes: upload.buffer.length,
      durationMs: kind === 'VOICE' ? Number(durationMs) : null,
    };
  }

  async open(storageKey: string): Promise<{ stream: ReadStream; size: number }> {
    const filePath = this.safePath(this.root, storageKey);
    return this.openFile(filePath);
  }

  async openPacsPreview(imagePath?: string, studyUid?: string | null, clinicId?: string): Promise<{ stream: ReadStream | Readable; size: number; mimeType: string }> {
    const config = clinicId && this.pacs ? await this.pacs.resolve(clinicId) : null;
    const template = clinicId ? config?.template : this.pacsPreviewUrlTemplate;
    const token = clinicId ? config?.token : this.pacsAccessToken;
    if (template && studyUid) {
      try {
        return await this.openRemotePacsPreview(studyUid, template, token);
      } catch {
        // A configured local export remains available during a PACS outage.
      }
    }
    if (!imagePath) {
      throw new NotFoundException('Aucun aperçu PACS distant ou local n’est configuré pour cet examen.');
    }
    const extension = path.extname(imagePath).toLowerCase();
    const mimeTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    if (!mimeTypes[extension]) {
      throw new NotFoundException('Cet examen ne possède pas d’aperçu JPEG, PNG ou WebP partageable.');
    }
    const uploadRoot = path.resolve(process.env.IMAGING_PREVIEW_UPLOAD_DIR || path.join(process.cwd(), 'storage', 'imaging-previews'));
    const roots = this.pacsPreviewRoot ? [uploadRoot, this.pacsPreviewRoot] : [uploadRoot];
    let filePath = '';
    for (const root of roots) {
      const candidate = this.safePath(root, imagePath);
      if (await stat(candidate).catch(() => null)) { filePath = candidate; break; }
    }
    if (!filePath) throw new NotFoundException('Aperçu PACS local introuvable.');
    const details = await stat(filePath);
    if (!details.isFile() || details.size > PHOTO_MAX_BYTES) throw new NotFoundException('Aperçu PACS local invalide ou supérieur à 8 Mo.');
    const buffer = await readFile(filePath);
    if (detectPhotoFormat(buffer)?.mimeType !== mimeTypes[extension]) {
      throw new NotFoundException('Le contenu de l’aperçu PACS local ne correspond pas à une image valide.');
    }
    return { stream: Readable.from(buffer), size: buffer.length, mimeType: mimeTypes[extension] };
  }

  hasPacsPreview(imagePaths: string[], studyUid?: string | null, configuredTemplate?: string | null) {
    return Boolean(
      ((configuredTemplate === undefined ? this.pacsPreviewUrlTemplate : configuredTemplate) && studyUid)
      || imagePaths.some(value => /\.(?:jpe?g|png|webp)$/i.test(value)),
    );
  }

  async hasClinicPacsPreview(clinicId: string, imagePaths: string[], studyUid?: string | null) {
    const config = this.pacs ? await this.pacs.resolve(clinicId) : null;
    return this.hasPacsPreview(imagePaths, studyUid, config?.template ?? null);
  }

  private async openRemotePacsPreview(studyUid: string, template: string, token?: string | null) {
    if (!template.includes('{studyUid}')) {
      throw new NotFoundException('Le modèle d’adresse PACS doit contenir {studyUid}.');
    }
    const url = new URL(template.replace('{studyUid}', encodeURIComponent(studyUid)));
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && process.env.PACS_ALLOW_INSECURE_HTTP === 'true'))) {
      throw new NotFoundException('L’adresse PACS doit utiliser HTTPS, sauf réseau local explicitement autorisé.');
    }
    const response = await fetch(url, {
      headers: { Accept: 'image/jpeg,image/png,image/webp', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const mimeType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new NotFoundException('Le PACS n’a pas fourni d’aperçu d’image valide.');
    }
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > PHOTO_MAX_BYTES) throw new NotFoundException('L’aperçu PACS dépasse 8 Mo.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > PHOTO_MAX_BYTES || detectPhotoFormat(buffer)?.mimeType !== mimeType) {
      throw new NotFoundException('Le contenu reçu du PACS n’est pas une image valide.');
    }
    return { stream: Readable.from(buffer), size: buffer.length, mimeType };
  }

  async discard(storageKey: string) {
    try {
      await unlink(this.safePath(this.root, storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private safePath(root: string, candidate: string) {
    if (!candidate || candidate.includes('\0')) throw new NotFoundException('Fichier introuvable.');
    const resolved = path.resolve(root, candidate);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new NotFoundException('Fichier introuvable.');
    }
    return resolved;
  }

  private async openFile(filePath: string) {
    try {
      const details = await stat(filePath);
      if (!details.isFile()) throw new NotFoundException('Fichier introuvable.');
      const stream = createReadStream(filePath);
      await new Promise<void>((resolve, reject) => {
        stream.once('open', () => resolve());
        stream.once('error', reject);
      });
      return { stream, size: details.size };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('Le fichier n’est plus disponible sur le serveur local.');
    }
  }
}
