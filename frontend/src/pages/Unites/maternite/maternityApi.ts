import { apiFetch } from "../../../config/api";
import type { CareEvent, PatientSummary } from "../../../api/careWorkflow";

export type Pregnancy = {
  id: string; patientId: string; status: "ONGOING" | "DELIVERED" | "ENDED"; lastMenstrualPeriod?: string | null; expectedDeliveryDate?: string | null;
  gravida?: number | null; parity?: number | null; riskLevel?: string | null; riskFactors?: string | null; bloodGroup?: string | null;
  notes?: string | null; outcome?: string | null; version: number; createdAt: string; patient: PatientSummary;
};
export type PregnancyFields = Partial<Pick<Pregnancy, "gravida" | "parity" | "riskLevel" | "riskFactors" | "bloodGroup" | "notes">> & { lastMenstrualPeriod?: string; expectedDeliveryDate?: string };

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
const base = (unitId: string) => `/care-workflow/units/${unitId}`;

export const fetchPregnancies = (unitId: string, status?: string) => apiFetch<Pregnancy[]>(`${base(unitId)}/pregnancies${status ? `?status=${status}` : ""}`);
export const createPregnancy = (unitId: string, body: PregnancyFields & { patientId: string }) => apiFetch<Pregnancy>(`${base(unitId)}/pregnancies`, json("POST", body));
export const updatePregnancy = (unitId: string, id: string, body: PregnancyFields & { version: number; status?: Pregnancy["status"]; outcome?: string }) =>
  apiFetch<Pregnancy>(`${base(unitId)}/pregnancies/${id}`, json("PATCH", body));
export const registerNewborn = (unitId: string, body: { motherEpisodeId: string; sex: "MALE" | "FEMALE" | "UNKNOWN"; birthAt: string; firstName?: string; birthOrder?: number; measurements?: Record<string, unknown>; closePregnancy?: boolean }) =>
  apiFetch(`${base(unitId)}/newborns`, json("POST", body));
export const fetchUnitEvents = (unitId: string, params: { types: string[]; patientId?: string; from?: string; to?: string }) => {
  const query = new URLSearchParams({ types: params.types.join(",") });
  if (params.patientId) query.set("patientId", params.patientId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return apiFetch<Array<CareEvent & { patientId?: string | null; patient?: PatientSummary }>>(`${base(unitId)}/register?${query.toString()}`);
};
