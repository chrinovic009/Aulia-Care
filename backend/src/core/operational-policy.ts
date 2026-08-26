/**
 * Small, deterministic Core policies. Keeping them pure makes critical
 * operational rules testable without a database or a web server.
 */
export const SYSTEM_SAFE_NURSE_PATIENT_CAPACITY = 5;

export function resolveNursePatientCapacity(unitOverride?: number | null, clinicDefault?: number | null): number {
  const configured = unitOverride ?? clinicDefault ?? SYSTEM_SAFE_NURSE_PATIENT_CAPACITY;
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 100)
    : SYSTEM_SAFE_NURSE_PATIENT_CAPACITY;
}

export function parseClockTime(value: string | null | undefined, fallback: string): { hour: number; minute: number } {
  const source = value || fallback;
  const [hour, minute] = source.split(':').map(Number);
  if (Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
    return { hour, minute };
  }
  return parseClockTime(fallback, '00:00');
}
