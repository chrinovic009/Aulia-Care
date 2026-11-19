/**
 * Small, deterministic Core policies. Keeping them pure makes critical
 * operational rules testable without a database or a web server.
 */
export const SYSTEM_SAFE_NURSE_PATIENT_CAPACITY = 5;
/** Technical guardrail only; it is not a clinical staffing recommendation. */
export const SYSTEM_MAX_NURSE_PATIENT_CAPACITY = 100;

export function isValidClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * A clinic timezone is a geographic IANA zone (Region/City) or UTC. Fixed
 * offsets such as `Etc/GMT+3` are refused: their sign is inverted and they
 * ignore daylight saving, a classic source of shift errors.
 */
export function isValidIanaTimezone(value: string): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (value === 'UTC') return true;
  if (!value.includes('/') || value.startsWith('Etc/')) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the nurse/patient capacity. An invalid stored value still falls
 * back to the safe default (scheduling must keep working), but it is reported
 * through `onInvalid` (a console warning by default) so the misconfiguration
 * is visible instead of silent.
 */
export function resolveNursePatientCapacity(
  unitOverride?: number | null,
  clinicDefault?: number | null,
  onInvalid: (reason: string) => void = (reason) => console.warn(`[operational-policy] ${reason}`),
): number {
  const configured = unitOverride ?? clinicDefault ?? SYSTEM_SAFE_NURSE_PATIENT_CAPACITY;
  if (!Number.isInteger(configured) || configured <= 0) {
    onInvalid(`Capacité infirmière invalide (${configured}) : valeur sûre ${SYSTEM_SAFE_NURSE_PATIENT_CAPACITY} appliquée.`);
    return SYSTEM_SAFE_NURSE_PATIENT_CAPACITY;
  }
  if (configured > SYSTEM_MAX_NURSE_PATIENT_CAPACITY) {
    onInvalid(`Capacité infirmière ${configured} plafonnée à ${SYSTEM_MAX_NURSE_PATIENT_CAPACITY}.`);
    return SYSTEM_MAX_NURSE_PATIENT_CAPACITY;
  }
  return configured;
}

/** Parses an HH:MM clock with the same strict rule as `isValidClockTime`. */
export function parseClockTime(value: string | null | undefined, fallback: string): { hour: number; minute: number } {
  const source = value && isValidClockTime(value) ? value : fallback;
  if (!isValidClockTime(source)) {
    if (fallback === '00:00') return { hour: 0, minute: 0 };
    return parseClockTime(fallback, '00:00');
  }
  const [hour, minute] = source.split(':').map(Number);
  return { hour, minute };
}
