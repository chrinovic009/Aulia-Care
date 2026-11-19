const labels: Record<string, string> = {
  EN_ATTENTE_INFIRMERIE: "En attente de l’infirmerie",
  EN_ATTENTE_MEDECIN: "En attente du médecin",
  EN_CONSULTATION: "En consultation",
  EN_ATTENTE_CAISSE: "En attente de la caisse",
  EN_ATTENTE_LABORATOIRE: "En attente du laboratoire",
  EN_ATTENTE_RADIOLOGIE: "En attente de la radiologie",
  EN_ATTENTE_PHARMACIE: "En attente de la pharmacie",
  EN_HOSPITALISATION: "En hospitalisation",
  EN_ATTENTE_SORTIE: "En attente de sortie",
  TERMINE: "Parcours terminé",
  ANNULE: "Parcours annulé",
};
export function workflowStatusLabel(value?: string | null): string {
  if (!value) return "Statut non renseigné";
  return labels[value] || value.toLowerCase().split("_").filter(Boolean).join(" ");
}
