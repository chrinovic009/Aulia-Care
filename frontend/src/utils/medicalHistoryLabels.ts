const historyKindLabels: Record<string, string> = {
  MEDICAL_CONSULTATION: "Consultation médicale",
  NURSE_ORIENTATION: "Orientation infirmière",
  ADMISSION_METADATA: "Admission réception",
  LAB_REQUEST: "Demande d'examen",
  PRESCRIPTION_CREATED: "Prescription créée",
  HOSPITALIZATION_DECLARED: "Hospitalisation déclarée",
  SURGERY_PLANNED: "Intervention programmée",
  NURSE_ROUND_DONE: "Tournée infirmière effectuée",
  NURSE_OBSERVATION: "Observation infirmière",
  NURSE_PROBLEM: "Problème infirmier signalé",
  VITAL_SIGNS_RECORDED: "Signes vitaux enregistrés",
  PAYMENT_RECORDED: "Paiement enregistré",
  DISCHARGE_AUTHORIZED: "Sortie autorisée",
};

export const medicalHistoryKindLabel = (kind?: string | null): string => {
  if (!kind) return "Événement médical";
  return historyKindLabels[kind] || kind
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
