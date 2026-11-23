import { BadRequestException } from '@nestjs/common';

/** Offline window accepted for an entry kept on a device while the network was down. */
export const OFFLINE_WINDOW_HOURS = 72;

/**
 * Real time of an entry made offline and sent later: kept when it is within
 * the offline window, refused in the future (a few minutes of clock drift are
 * tolerated) or when it is too old to be a mere network delay.
 */
export function resolveOfflineTime(value: string | null | undefined, label: string, now = new Date()): Date | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new BadRequestException(`Heure ${label} invalide.`);
  if (at.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException(`L’heure ${label} ne peut pas être dans le futur.`);
  if (now.getTime() - at.getTime() > OFFLINE_WINDOW_HOURS * 3_600_000) {
    throw new BadRequestException(`Saisie de plus de ${OFFLINE_WINDOW_HOURS} heures : enregistrez-la comme une observation tardive dans le dossier.`);
  }
  return at;
}
