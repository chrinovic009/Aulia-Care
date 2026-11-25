import { BadRequestException } from '@nestjs/common';

/** Offline window accepted for an entry kept on a device while the network was down. */
export const OFFLINE_WINDOW_HOURS = 72;

/** Header set only by the offline queue when it replays an entry made without network. */
export const OFFLINE_REPLAY_HEADER = 'x-aulia-offline-replay';

export interface RecordedTime {
  /** Time the act is recorded at: server time online, device time for an offline replay. */
  performedAt: Date;
  /** Server time the entry reached the server (always authoritative). */
  receivedAt: Date;
  /** True when performedAt comes from the device clock (offline replay). */
  recordedOffline: boolean;
}

export function isOfflineReplay(headerValue: string | string[] | undefined): boolean {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return value === '1';
}

/**
 * Online, the server clock is authoritative: a client-supplied time is ignored,
 * so a connected device cannot backdate a care entry. Only an entry explicitly
 * replayed by the offline queue keeps its device time, within 72 hours and
 * never in the future (5 minutes of clock drift tolerated); it is then flagged
 * as offline and keeps the server reception time next to it.
 */
export function resolveRecordedTime(value: string | null | undefined, label: string, offlineReplay: boolean, now = new Date()): RecordedTime {
  if (!offlineReplay || !value) return { performedAt: now, receivedAt: now, recordedOffline: false };
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new BadRequestException(`Heure ${label} invalide.`);
  if (at.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException(`L’heure ${label} ne peut pas être dans le futur.`);
  if (now.getTime() - at.getTime() > OFFLINE_WINDOW_HOURS * 3_600_000) {
    throw new BadRequestException(`Saisie de plus de ${OFFLINE_WINDOW_HOURS} heures : enregistrez-la comme une observation tardive dans le dossier.`);
  }
  return { performedAt: at, receivedAt: now, recordedOffline: true };
}
