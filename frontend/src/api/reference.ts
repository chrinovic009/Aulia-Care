import { apiFetch } from "../config/api";

export type SpecialtyGroup = { code: string; label: string; template: string; specialties: Array<{ label: string; domain: string }> };

let cache: Promise<SpecialtyGroup[]> | null = null;
/** Establishment-wide list of medical specialties, grouped (loaded once per session). */
export const fetchMedicalSpecialties = () => {
  cache ??= apiFetch<SpecialtyGroup[]>("/reference/medical-specialties").catch((error) => { cache = null; throw error; });
  return cache;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").trim();
/** Specialties listed in several groups use the first group whose form fits them best (same rule as the server). */
const PRIMARY_GROUP: Record<string, string> = {
  Neurologie: "NEURO", Psychiatrie: "NEURO", "Médecine du sommeil": "NEURO", "Médecine de la douleur": "NEURO",
  "Néonatologie": "PEDIATRIC", "Chirurgie pédiatrique": "SURGICAL", Neurochirurgie: "SURGICAL", "Chirurgie maxillo-faciale": "DENTAL",
  "Réanimation pédiatrique": "CRITICAL", "Médecine tropicale": "MEDICAL", "Médecine environnementale": "MEDICAL",
};
export function specialtyInfo(groups: SpecialtyGroup[], value?: string | null) {
  if (!value) return null;
  const key = normalize(value);
  for (const group of groups) {
    const found = group.specialties.find((item) => normalize(item.label) === key);
    if (found) {
      const owner = groups.find((item) => item.code === (PRIMARY_GROUP[found.label] ?? group.code)) ?? group;
      return { label: found.label, domain: found.domain, groupCode: owner.code, groupLabel: owner.label, template: owner.template };
    }
  }
  return null;
}
