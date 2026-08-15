import type { LabRequestDetail } from "./activityLab.types";

export const normalizeInitial = (value?: string | null) => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "X";
};

export const getLabStatusLabel = (requestStatus?: string | null, resultStatus?: string | null) => {
  const status = String(requestStatus || "").trim().toUpperCase();
  const result = String(resultStatus || "").trim().toUpperCase();
  if (new Set(["TECHNICAL_VALIDATED", "BIOLOGICALLY_VALIDATED", "AVAILABLE", "SENT", "VERIFIED", "COMPLETED"]).has(result)
    || new Set(["TECHNICAL_VALIDATED", "BIOLOGICALLY_VALIDATED", "AVAILABLE", "SENT", "VERIFIED", "COMPLETED"]).has(status)) return "Validé";
  if (result && new Set(["PENDING", "CORRECTION_REQUESTED", "IN_ANALYSIS", "RECEIVED", "COLLECTED"]).has(result)) return "Traité";
  if (status && new Set(["REQUESTED", "COLLECTED", "RECEIVED", "IN_ANALYSIS"]).has(status)) return "Demande";
  if (status && new Set(["PENDING", "CORRECTION_REQUESTED", "IN_ANALYSIS", "RECEIVED", "COLLECTED"]).has(status)) return "Traité";
  return status || "Demande";
};

export const buildLabRequestDisplayId = (position?: number, patient?: LabRequestDetail["patient"], examCount?: number, fallback?: string) => {
  if (!position) return fallback || "-";
  return `${position}${normalizeInitial(patient?.firstName)}${normalizeInitial(patient?.lastName)}-EXAMD${examCount || 1}`;
};

export const formatNfsParameterReference = (
  parameter: { referenceRange?: string | null; unit?: string | null; name: string },
  patientGender?: string | null,
) => {
  const referenceValue = String(parameter.referenceRange || "").trim();
  const unit = String(parameter.unit || "").trim();
  if (!referenceValue) return unit ? `— ${unit}` : "—";
  const gender = String(patientGender || "").trim().toUpperCase();
  let formatted = referenceValue;
  if (referenceValue.includes("(H)") || referenceValue.includes("(F)")) {
    const parts = referenceValue.split("/").map((part) => part.trim());
    formatted = gender === "F" || gender.includes("FEM")
      ? parts.find((part) => /\(F\)/i.test(part)) || parts[1] || parts[0]
      : parts.find((part) => /\(H\)/i.test(part)) || parts[0];
    formatted = formatted.replace(/\s*\([^)]*\)/g, "").trim();
  }
  return unit && !formatted.toLowerCase().includes(unit.toLowerCase()) ? `${formatted} ${unit}` : formatted;
};
