import type { ReactNode } from "react";

/**
 * Consultation sections specific to the doctor's group of specialties. Every
 * value is entered by the doctor; nothing is computed or interpreted here.
 */
export type SpecialtyExamValue = { specialty?: string; template?: string; values: Record<string, string>; teeth?: Record<string, string> };
type FieldDef = { key: string; label: string; options?: string[]; long?: boolean };
type Section = { title: string; fields: FieldDef[] };

const yesNo = ["Oui", "Non", "Non évalué"];
export const SPECIALTY_TEMPLATES: Record<string, { title: string; sections: Section[] }> = {
  SURGICAL: { title: "Évaluation chirurgicale", sections: [
    { title: "Indication", fields: [
      { key: "surgicalIndication", label: "Indication opératoire discutée", long: true },
      { key: "site", label: "Site / organe" }, { key: "laterality", label: "Latéralité", options: ["Droite", "Gauche", "Bilatérale", "Médiane", "Sans objet"] },
      { key: "urgency", label: "Caractère", options: ["Programmé", "Urgent différé", "Urgence immédiate"] },
    ] },
    { title: "Décision", fields: [
      { key: "surgicalDecision", label: "Décision", options: ["Intervention proposée", "Surveillance", "Avis complémentaire", "Pas d’indication chirurgicale"] },
      { key: "consentDiscussed", label: "Bénéfices / risques expliqués au patient", options: yesNo },
      { key: "anesthesiaConsult", label: "Consultation d’anesthésie à prévoir", options: yesNo },
      { key: "surgicalNotes", label: "Remarques du chirurgien", long: true },
    ] },
  ] },
  WOMEN: { title: "Gynécologie & obstétrique", sections: [
    { title: "Contexte", fields: [
      { key: "lmp", label: "Date des dernières règles (DDR)" }, { key: "gestationalAge", label: "Terme (SA + jours), tel qu’établi" },
      { key: "gravida", label: "Gestité (G)" }, { key: "parity", label: "Parité (P)" }, { key: "livingChildren", label: "Enfants vivants" },
      { key: "contraception", label: "Contraception" }, { key: "lastSmear", label: "Dernier frottis / dépistage" },
    ] },
    { title: "Examen", fields: [
      { key: "fundalHeight", label: "Hauteur utérine (cm)" }, { key: "fetalHeart", label: "Bruits du cœur fœtal" },
      { key: "fetalMovements", label: "Mouvements actifs perçus", options: yesNo }, { key: "cervix", label: "Col (toucher vaginal)" },
      { key: "bleeding", label: "Saignements / pertes" }, { key: "breasts", label: "Examen des seins" },
      { key: "obstetricNotes", label: "Remarques", long: true },
    ] },
  ] },
  PEDIATRIC: { title: "Pédiatrie", sections: [
    { title: "Croissance", fields: [
      { key: "weightKg", label: "Poids (kg)" }, { key: "heightCm", label: "Taille (cm)" }, { key: "headCircumference", label: "Périmètre crânien (cm)" },
      { key: "growthCurve", label: "Position sur la courbe (relevée par vous)" }, { key: "feeding", label: "Alimentation" },
    ] },
    { title: "Développement & prévention", fields: [
      { key: "development", label: "Développement psychomoteur" }, { key: "vaccination", label: "Statut vaccinal (carnet)", options: ["À jour", "En retard", "Carnet absent"] },
      { key: "caregiver", label: "Accompagnant / informateur" }, { key: "pediatricNotes", label: "Remarques", long: true },
    ] },
  ] },
  NEURO: { title: "Examen neurologique & psychique", sections: [
    { title: "Neurologie", fields: [
      { key: "glasgow", label: "Glasgow (3-15)" }, { key: "orientation", label: "Orientation temps / espace" },
      { key: "cranialNerves", label: "Paires crâniennes" }, { key: "motor", label: "Motricité / déficit" }, { key: "sensory", label: "Sensibilité" },
      { key: "reflexes", label: "Réflexes" }, { key: "gait", label: "Marche / équilibre" }, { key: "language", label: "Langage" },
    ] },
    { title: "État psychique", fields: [
      { key: "mood", label: "Humeur / affect" }, { key: "thought", label: "Pensée / perceptions" }, { key: "insight", label: "Conscience des troubles" },
      { key: "riskAssessed", label: "Risque pour soi ou autrui évalué", options: ["Évalué : pas de risque immédiat", "Évalué : risque, mesures prises", "Non évalué"] },
      { key: "neuroNotes", label: "Remarques", long: true },
    ] },
  ] },
  SENSORY: { title: "Yeux, oreilles, nez, gorge", sections: [
    { title: "Vision", fields: [
      { key: "vaRight", label: "Acuité visuelle OD" }, { key: "vaLeft", label: "Acuité visuelle OG" },
      { key: "iopRight", label: "Tension oculaire OD" }, { key: "iopLeft", label: "Tension oculaire OG" }, { key: "fundus", label: "Fond d’œil" },
    ] },
    { title: "ORL", fields: [
      { key: "otoscopyRight", label: "Otoscopie droite" }, { key: "otoscopyLeft", label: "Otoscopie gauche" }, { key: "hearing", label: "Audition" },
      { key: "nose", label: "Nez / sinus" }, { key: "throat", label: "Gorge / larynx / voix" }, { key: "sensoryNotes", label: "Remarques", long: true },
    ] },
  ] },
  DENTAL: { title: "Examen bucco-dentaire", sections: [
    { title: "Bouche", fields: [
      { key: "hygiene", label: "Hygiène bucco-dentaire", options: ["Bonne", "Moyenne", "Mauvaise"] }, { key: "gums", label: "Gencives / parodonte" },
      { key: "mucosa", label: "Muqueuses" }, { key: "occlusion", label: "Occlusion / ATM" }, { key: "dentalPlan", label: "Plan de traitement", long: true },
    ] },
  ] },
  PREVENTION: { title: "Prévention & aptitude", sections: [
    { title: "Contexte", fields: [
      { key: "visitType", label: "Type de visite", options: ["Embauche", "Périodique", "Reprise", "Dépistage", "Voyage", "Scolaire", "Autre"] },
      { key: "exposure", label: "Poste / expositions" }, { key: "vaccinations", label: "Vaccinations", options: ["À jour", "À compléter", "Inconnu"] },
    ] },
    { title: "Conclusion", fields: [
      { key: "fitness", label: "Avis d’aptitude", options: ["Apte", "Apte avec restrictions", "Inapte temporaire", "Inapte", "Sans objet"] },
      { key: "restrictions", label: "Restrictions / aménagements" }, { key: "preventionAdvice", label: "Conseils de prévention", long: true },
    ] },
  ] },
  CRITICAL: { title: "Évaluation d’urgence & anesthésie", sections: [
    { title: "Urgence", fields: [
      { key: "abcde", label: "ABCDE", long: true }, { key: "severity", label: "Score de gravité utilisé (nom et valeur)" },
    ] },
    { title: "Anesthésie", fields: [
      { key: "asa", label: "Classe ASA (évaluée par vous)", options: ["I", "II", "III", "IV", "V", "VI", "Non évaluée"] },
      { key: "mallampati", label: "Mallampati", options: ["I", "II", "III", "IV", "Non évalué"] },
      { key: "fasting", label: "Heure du dernier repas / boisson" }, { key: "anesthesiaHistory", label: "Antécédents anesthésiques" },
      { key: "criticalNotes", label: "Remarques", long: true },
    ] },
  ] },
};

const FDI_ROWS = [[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]];
const TOOTH_STATES = ["", "Saine", "Carie", "Obturée", "Absente", "À extraire", "Couronne", "Implant", "Fracturée"];

export function SpecialtyExam({ template, specialty, value, onChange, renderField }: {
  template: string; specialty: string; value: SpecialtyExamValue; onChange: (value: SpecialtyExamValue) => void;
  renderField: (label: string, input: ReactNode) => ReactNode;
}) {
  const def = SPECIALTY_TEMPLATES[template];
  if (!def) return null;
  const set = (key: string, text: string) => onChange({ ...value, specialty, template, values: { ...value.values, [key]: text } });
  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white";
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Rubriques propres à : <strong>{specialty}</strong>. Elles complètent l’examen général et sont enregistrées dans la consultation.</p>
      {def.sections.map((section) => (
        <div key={section.title}>
          <h4 className="mb-2 text-sm font-bold text-aulia-navy dark:text-white">{section.title}</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.key} className={field.long ? "md:col-span-2" : ""}>
                {renderField(field.label, field.options ? (
                  <select className={input} value={value.values[field.key] ?? ""} onChange={(e) => set(field.key, e.target.value)}>
                    <option value="">—</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : field.long ? (
                  <textarea className={input} rows={2} value={value.values[field.key] ?? ""} onChange={(e) => set(field.key, e.target.value)} />
                ) : (
                  <input className={input} value={value.values[field.key] ?? ""} onChange={(e) => set(field.key, e.target.value)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      {template === "DENTAL" && (
        <div>
          <h4 className="mb-2 text-sm font-bold text-aulia-navy dark:text-white">Schéma dentaire (numérotation FDI)</h4>
          <div className="overflow-x-auto">
            {FDI_ROWS.map((row, index) => (
              <div key={index} className="mb-1 flex gap-1">
                {row.map((tooth) => {
                  const state = value.teeth?.[tooth] ?? "";
                  return (
                    <label key={tooth} className={`flex w-16 shrink-0 flex-col items-center rounded border p-1 text-xs ${state && state !== "Saine" ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-slate-200 dark:border-slate-700"}`}>
                      <span className="font-bold">{tooth}</span>
                      <select className="w-full bg-transparent text-xs" value={state} onChange={(e) => onChange({ ...value, specialty, template, teeth: { ...(value.teeth ?? {}), [tooth]: e.target.value } })}>
                        {TOOTH_STATES.map((option) => <option key={option} value={option}>{option || "—"}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
