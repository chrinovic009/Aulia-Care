/**
 * Small, deterministic Core policies. Keeping them pure makes critical
 * operational rules testable without a database or a web server.
 */
export { SYSTEM_SAFE_NURSE_PATIENT_CAPACITY, SYSTEM_MAX_NURSE_PATIENT_CAPACITY, resolveNursePatientCapacity } from '../hospitalizations/nurse-capacity.policy';

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
