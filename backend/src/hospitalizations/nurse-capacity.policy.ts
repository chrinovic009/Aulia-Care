export const SYSTEM_SAFE_NURSE_PATIENT_CAPACITY = 5;
/** Technical guardrail only; it is not a clinical staffing recommendation. */
export const SYSTEM_MAX_NURSE_PATIENT_CAPACITY = 100;

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

