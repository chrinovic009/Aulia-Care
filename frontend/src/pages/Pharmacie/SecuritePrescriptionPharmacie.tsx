import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  fetchInteractionRules,
  fetchMedicationIdentities,
  proposeInteractionRule,
  retireInteractionRule,
  updateMedicationIdentity,
  validateInteractionRule,
  type InteractionRule,
  type MedicationIdentity,
} from "../../api/clinicalSafety";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white";
const SEVERITIES: Record<InteractionRule["severity"], string> = { MINOR: "Mineure", MODERATE: "Modérée", MAJOR: "Majeure (bloquante)", CONTRAINDICATED: "Contre-indication (bloquante)" };
const STATUSES: Record<InteractionRule["status"], string> = { PROPOSED: "À valider", ACTIVE: "Active", RETIRED: "Retirée" };
const person = (value?: { firstName?: string; lastName?: string } | null) => value ? `${value.firstName || ""} ${value.lastName || ""}`.trim() : "—";
const emptyRule = { substanceA: "", substanceB: "", severity: "MAJOR" as InteractionRule["severity"], effect: "", recommendation: "", source: "" };

/**
 * The establishment's prescription safety references: interaction rules
 * (proposed by one person, validated by another) and the DCI / ATC code of each
 * catalogue medication, without which a rule or an allergy cannot be matched.
 */
export default function SecuritePrescriptionPharmacie() {
  const [rules, setRules] = useState<InteractionRule[]>([]);
  const [draft, setDraft] = useState(emptyRule);
  const [search, setSearch] = useState("");
  const [medications, setMedications] = useState<MedicationIdentity[]>([]);
  const [edits, setEdits] = useState<Record<string, { activeSubstance: string; atcCode: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const loadRules = () => fetchInteractionRules().then(setRules).catch(() => setError("Les règles d’interaction n’ont pas pu être chargées."));
  useEffect(() => { void loadRules(); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchMedicationIdentities(search.trim() || undefined).then(setMedications).catch(() => setError("Le catalogue n’a pas pu être chargé.")); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const ready = draft.substanceA.trim().length >= 3 && draft.substanceB.trim().length >= 3 && draft.effect.trim().length >= 5 && draft.source.trim().length >= 3;
  const propose = async () => {
    try {
      await proposeInteractionRule({ ...draft, recommendation: draft.recommendation.trim() || undefined });
      setDraft(emptyRule);
      await loadRules();
    } catch { /* reported globally */ }
  };
  const act = async (work: () => Promise<unknown>) => { try { await work(); await loadRules(); } catch { /* reported globally */ } };
  const retire = (rule: InteractionRule) => {
    const reason = window.prompt("Pourquoi retirer cette règle ? (10 caractères minimum)");
    if (reason && reason.trim().length >= 10) void act(() => retireInteractionRule(rule.id, reason.trim()));
  };
  const saveMedication = async (medication: MedicationIdentity) => {
    const edit = edits[medication.id];
    if (!edit) return;
    try {
      const saved = await updateMedicationIdentity(medication.id, { activeSubstance: edit.activeSubstance, atcCode: edit.atcCode || undefined });
      setMedications((rows) => rows.map((row) => row.id === saved.id ? saved : row));
      setEdits((rows) => { const next = { ...rows }; delete next[medication.id]; return next; });
    } catch { /* reported globally */ }
  };

  return (
    <>
      <PageMeta title="Sécurité de prescription | Aulia Care" description="Règles d’interaction et identité des médicaments" />
      <PageBreadcrumb pageTitle="Sécurité de prescription" />
      <div className="space-y-6">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-bold text-aulia-navy dark:text-white">Règles d’interaction de l’établissement</h2>
          <p className="mt-1 text-sm text-slate-500">Aulia Care ne fournit aucune base médicamenteuse : chaque règle vient d’une source citée, est proposée par une personne et validée par une autre avant de s’appliquer. Une substance peut être une DCI ou un préfixe ATC (ex. une classe entière).</p>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <input className={field} placeholder="Substance A (DCI ou ATC)" value={draft.substanceA} onChange={(e) => setDraft({ ...draft, substanceA: e.target.value })} />
            <input className={field} placeholder="Substance B (DCI ou ATC)" value={draft.substanceB} onChange={(e) => setDraft({ ...draft, substanceB: e.target.value })} />
            <select className={field} value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as InteractionRule["severity"] })}>
              {Object.entries(SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input className={field} placeholder="Effet attendu" value={draft.effect} onChange={(e) => setDraft({ ...draft, effect: e.target.value })} />
            <input className={field} placeholder="Conduite à tenir (facultatif)" value={draft.recommendation} onChange={(e) => setDraft({ ...draft, recommendation: e.target.value })} />
            <input className={field} placeholder="Source (référentiel, édition, page)" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
          </div>
          <button type="button" disabled={!ready} onClick={() => void propose()} className="mt-3 rounded-lg bg-aulia-teal px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Proposer la règle</button>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">Substances</th><th className="p-3">Gravité</th><th className="p-3">Effet / conduite</th><th className="p-3">Source</th><th className="p-3">Statut</th><th className="p-3" /></tr></thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="p-3 font-semibold">{rule.substanceA} + {rule.substanceB}</td>
                    <td className="p-3">{SEVERITIES[rule.severity]}</td>
                    <td className="p-3">{rule.effect}{rule.recommendation ? <p className="text-xs text-slate-500">{rule.recommendation}</p> : null}</td>
                    <td className="p-3 text-xs">{rule.source}</td>
                    <td className="p-3 text-xs">{STATUSES[rule.status]}<p className="text-slate-500">Proposée par {person(rule.proposedBy)}{rule.validatedBy ? ` · validée par ${person(rule.validatedBy)}` : ""}</p>{rule.statusReason ? <p className="text-slate-500">{rule.statusReason}</p> : null}</td>
                    <td className="p-3 text-right">
                      {rule.status === "PROPOSED" && <button type="button" className="mr-3 font-semibold text-aulia-teal" onClick={() => void act(() => validateInteractionRule(rule.id))}>Valider</button>}
                      {rule.status !== "RETIRED" && <button type="button" className="font-semibold text-red-600" onClick={() => retire(rule)}>Retirer</button>}
                    </td>
                  </tr>
                ))}
                {!rules.length && <tr><td className="p-3 text-slate-500" colSpan={6}>Aucune règle pour le moment.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-white/[0.03]">
          <h2 className="text-lg font-bold text-aulia-navy dark:text-white">DCI et code ATC des médicaments</h2>
          <p className="mt-1 text-sm text-slate-500">Sans DCI ni ATC, un médicament n’est reconnu que par son nom commercial : les allergies et interactions risquent de ne pas être détectées.</p>
          <input className={`${field} mt-3 max-w-md`} placeholder="Rechercher par nom, DCI ou ATC" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">Médicament</th><th className="p-3">DCI</th><th className="p-3">Code ATC</th><th className="p-3" /></tr></thead>
              <tbody>
                {medications.map((medication) => {
                  const edit = edits[medication.id] ?? { activeSubstance: medication.activeSubstance || "", atcCode: medication.atcCode || "" };
                  const change = (patch: Partial<typeof edit>) => setEdits((rows) => ({ ...rows, [medication.id]: { ...edit, ...patch } }));
                  return (
                    <tr key={medication.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-3 font-semibold">{medication.name}{!medication.activeSubstance && !medication.atcCode && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">à compléter</span>}</td>
                      <td className="p-3"><input className={field} value={edit.activeSubstance} onChange={(e) => change({ activeSubstance: e.target.value })} /></td>
                      <td className="p-3"><input className={field} value={edit.atcCode} onChange={(e) => change({ atcCode: e.target.value.toUpperCase() })} placeholder="Ex. J01CA04" /></td>
                      <td className="p-3 text-right">{edits[medication.id] && <button type="button" className="font-semibold text-aulia-teal" onClick={() => void saveMedication(medication)}>Enregistrer</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
