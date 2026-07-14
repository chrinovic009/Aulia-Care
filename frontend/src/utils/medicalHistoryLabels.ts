const historyKindLabels: Record<string, string> = {
  MEDICAL_CONSULTATION: "Consultation medicale",
  NURSE_ORIENTATION: "Orientation infirmiere",
  ADMISSION_METADATA: "Admission reception",
  NOUVELLE_VISITE: "Nouvelle visite",
  LAB_REQUEST: "Demande d'examen",
  PRESCRIPTION_CREATED: "Prescription creee",
  HOSPITALIZATION_DECLARED: "Hospitalisation declaree",
  SURGERY_PLANNED: "Intervention programmee",
  NURSE_ROUND_DONE: "Tournee infirmiere effectuee",
  NURSE_OBSERVATION: "Observation infirmiere",
  NURSE_PROBLEM: "Probleme infirmier signale",
  VITAL_SIGNS_RECORDED: "Signes vitaux enregistres",
  PAYMENT_RECORDED: "Paiement enregistre",
  DISCHARGE_AUTHORIZED: "Sortie autorisee",
  RESULT_RECORDED: "Resultat laboratoire enregistre",
  RESULT_RELEASED: "Resultat laboratoire transmis",
};

export const medicalHistoryKindLabel = (kind?: string | null): string => {
  if (!kind) return "Evenement medical";
  return historyKindLabels[kind] || kind
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
