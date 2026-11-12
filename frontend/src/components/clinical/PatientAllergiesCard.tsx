import { useEffect, useState } from "react";
import { fetchAllergies, recordAllergy, resolveAllergy, type Allergy } from "../../api/clinicalSafety";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const LABELS: Record<Allergy["severity"], string> = { MILD: "Légère", MODERATE: "Modérée", SEVERE: "Sévère" };

/** Documented allergies of the patient, checked at every prescription. */
export function PatientAllergiesCard({ patientId }: { patientId: string }) {
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ substance: string; severity: Allergy["severity"]; reaction: string }>({ substance: "", severity: "MODERATE", reaction: "" });

  const load = () => fetchAllergies(patientId).then((rows) => { setAllergies(rows); setError(null); }).catch(() => setError("Les allergies n’ont pas pu être chargées : vérifiez-les avant de prescrire."));
  useEffect(() => { void load(); }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = allergies.filter((allergy) => !allergy.resolved);
  const save = async () => {
    if (draft.substance.trim().length < 3) return;
    try {
      await recordAllergy(patientId, { substance: draft.substance.trim(), severity: draft.severity, reaction: draft.reaction.trim() || undefined });
      setDraft({ substance: "", severity: "MODERATE", reaction: "" });
      setAdding(false);
      await load();
    } catch { /* the global feedback already explains the failure */ }
  };
  const resolve = async (allergy: Allergy) => {
    const reason = window.prompt(`Pourquoi lever l’allergie « ${allergy.substance} » ? (10 caractères minimum)`);
    if (!reason || reason.trim().length < 10) return;
    try { await resolveAllergy(allergy.id, reason.trim()); await load(); } catch { /* reported globally */ }
  };

  return (
    <div className={`rounded-xl border p-3 text-sm ${active.length ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : "border-slate-200 dark:border-slate-800"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-slate-800 dark:text-white">Allergies documentées {active.length ? `(${active.length})` : ""}</p>
        <button type="button" className="text-xs font-bold text-aulia-teal" onClick={() => setAdding((value) => !value)}>{adding ? "Annuler" : "Documenter une allergie"}</button>
      </div>
      {error && <p className="mt-2 text-red-700 dark:text-red-200">{error}</p>}
      {!error && !active.length && <p className="mt-1 text-slate-500">Aucune allergie connue documentée.</p>}
      {active.length > 0 && (
        <ul className="mt-2 space-y-1">
          {active.map((allergy) => (
            <li key={allergy.id} className="flex flex-wrap items-center justify-between gap-2 text-red-800 dark:text-red-200">
              <span><strong>{allergy.substance}</strong> · {LABELS[allergy.severity]}{allergy.reaction ? ` · ${allergy.reaction}` : ""}</span>
              <button type="button" className="text-xs font-semibold underline" onClick={() => void resolve(allergy)}>Lever</button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div className="mt-3 grid gap-2 md:grid-cols-[2fr_1fr_2fr_auto]">
          <input className={field} placeholder="Substance, DCI ou code ATC" value={draft.substance} onChange={(event) => setDraft((value) => ({ ...value, substance: event.target.value }))} />
          <select className={field} value={draft.severity} onChange={(event) => setDraft((value) => ({ ...value, severity: event.target.value as Allergy["severity"] }))}>
            <option value="MILD">Légère</option><option value="MODERATE">Modérée</option><option value="SEVERE">Sévère</option>
          </select>
          <input className={field} placeholder="Réaction observée" value={draft.reaction} onChange={(event) => setDraft((value) => ({ ...value, reaction: event.target.value }))} />
          <button type="button" className="rounded-lg bg-aulia-teal px-3 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={draft.substance.trim().length < 3} onClick={() => void save()}>Enregistrer</button>
        </div>
      )}
    </div>
  );
}
