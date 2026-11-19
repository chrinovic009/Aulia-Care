import { ApiError, apiFetch } from "../config/api";

export type SafetyAlert = {
  kind: "ALLERGY" | "INTERACTION";
  blocking: boolean;
  severity: string;
  message: string;
  medicationIds: string[];
  source?: string;
  recommendation?: string | null;
};
export type SafetyEvaluation = { alerts: SafetyAlert[]; blocking: boolean };

export type Allergy = {
  id: string;
  substance: string;
  reaction?: string | null;
  severity: "MILD" | "MODERATE" | "SEVERE";
  resolved: boolean;
  recordedAt: string;
  notes?: string | null;
  recordedBy?: { firstName?: string; lastName?: string } | null;
};

export type InteractionRule = {
  id: string;
  substanceA: string;
  substanceB: string;
  severity: "MINOR" | "MODERATE" | "MAJOR" | "CONTRAINDICATED";
  effect: string;
  recommendation?: string | null;
  source: string;
  status: "PROPOSED" | "ACTIVE" | "RETIRED";
  statusReason?: string | null;
  proposedById: string;
  proposedBy?: { firstName?: string; lastName?: string } | null;
  validatedBy?: { firstName?: string; lastName?: string } | null;
  validatedAt?: string | null;
};

export type MedicationIdentity = { id: string; name: string; activeSubstance?: string | null; atcCode?: string | null };

export const PRESCRIPTION_SAFETY_ALERTS = "PRESCRIPTION_SAFETY_ALERTS";

/** The server refused a prescription because blocking safety alerts were not justified. */
export const safetyAlertsOf = (error: unknown): SafetyAlert[] | null =>
  error instanceof ApiError && error.status === 409 && error.body?.code === PRESCRIPTION_SAFETY_ALERTS && Array.isArray(error.body.alerts)
    ? (error.body.alerts as SafetyAlert[])
    : null;

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

export const checkPrescription = (patientId: string, medicationIds: string[]) =>
  apiFetch<SafetyEvaluation>(`/clinical-safety/patients/${patientId}/check`, json("POST", { medicationIds }));

export const fetchAllergies = (patientId: string) => apiFetch<Allergy[]>(`/clinical-safety/patients/${patientId}/allergies`);
export const recordAllergy = (patientId: string, payload: { substance: string; severity: Allergy["severity"]; reaction?: string; notes?: string }) =>
  apiFetch<Allergy>(`/clinical-safety/patients/${patientId}/allergies`, json("POST", payload));
export const resolveAllergy = (allergyId: string, reason: string) =>
  apiFetch<Allergy>(`/clinical-safety/allergies/${allergyId}/resolve`, json("PATCH", { reason }));

export const fetchInteractionRules = () => apiFetch<InteractionRule[]>(`/clinical-safety/interaction-rules`);
export const proposeInteractionRule = (payload: Pick<InteractionRule, "substanceA" | "substanceB" | "severity" | "effect" | "source"> & { recommendation?: string }) =>
  apiFetch<InteractionRule>(`/clinical-safety/interaction-rules`, json("POST", payload));
export const validateInteractionRule = (ruleId: string) =>
  apiFetch<InteractionRule>(`/clinical-safety/interaction-rules/${ruleId}/validate`, json("PATCH", {}));
export const retireInteractionRule = (ruleId: string, reason: string) =>
  apiFetch<InteractionRule>(`/clinical-safety/interaction-rules/${ruleId}/retire`, json("PATCH", { reason }));

export const fetchMedicationIdentities = (search?: string) =>
  apiFetch<MedicationIdentity[]>(`/clinical-safety/medications${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const updateMedicationIdentity = (medicationId: string, payload: { activeSubstance?: string; atcCode?: string }) =>
  apiFetch<MedicationIdentity>(`/clinical-safety/medications/${medicationId}`, json("PATCH", payload));
