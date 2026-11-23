import { apiFetch } from "../config/api";

export type ClinicalCode = { code: string; display: string; chapter?: string | null; system: "ICD10" | "LOINC" };

/** Search the installation's standard terminology (CIM-10 by default, or LOINC). */
export const searchClinicalCodes = (q: string, system: "ICD10" | "LOINC" = "ICD10") =>
  q.trim().length < 2
    ? Promise.resolve([] as ClinicalCode[])
    : apiFetch<ClinicalCode[]>(`/terminology/search?system=${system}&q=${encodeURIComponent(q.trim())}`);

export type DiagnosisStatistics = { since: string; total: number; chapters: Array<{ chapter: string; display: string; count: number }>; topCodes: Array<{ code: string; display: string; count: number }> };
export const fetchDiagnosisStatistics = (days = 30) => apiFetch<DiagnosisStatistics>(`/terminology/statistics/diagnoses?days=${days}`);
