import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ageLabel, changeEpisodeStatus, createServiceRequest, fetchClinicUnits, fetchEpisode, fetchResources, fetchUnitHistory, genderLabel, openEpisode, patientName,
  personName, recordCareEvent, timeLabel, updateResource,
  type CareEpisode, type CareEvent, type CareResource, type CareUnit, type PatientSummary, type Worklist,
} from "../../../api/careWorkflow";
import { isQueued } from "../../../offline/offlineQueue";
import { fetchUnitEvents } from "../maternite/maternityApi";
import { ResourcesBoard } from "../ResourcesBoard";
import { canWrite, PatientSearch } from "../shared";
import { Badge, Button, Card, Dialog, Empty, Field, inputClass, Stat } from "../ui";

export const DIALYSIS_TABS = [
  { id: "overview", label: "Vue d’ensemble" }, { id: "patients", label: "Patients" }, { id: "records", label: "Dossiers" }, { id: "planning", label: "Planning" },
  { id: "sessions", label: "Séances" }, { id: "monitoring", label: "Surveillance" }, { id: "prescriptions", label: "Prescriptions" }, { id: "machines", label: "Machines" },
  { id: "consumables", label: "Consommables" }, { id: "incidents", label: "Incidents" }, { id: "maintenance", label: "Maintenance" }, { id: "reports", label: "Rapports" },
] as const;
export type DialysisTab = (typeof DIALYSIS_TABS)[number]["id"];

/** Twelve-step session cycle. Mandatory documentation is enforced at closure (settings.closureRequirements). */
export const DIALYSIS_STEPS = [
  { code: "ARRIVAL", label: "Accueil" }, { code: "PRE_WEIGHT", label: "Pesée avant" }, { code: "PRE_ASSESSMENT", label: "Évaluation avant séance" },
  { code: "ACCESS_CHECK", label: "Contrôle de l’abord" }, { code: "MACHINE_PREP", label: "Préparation du générateur" }, { code: "CONNECTION", label: "Branchement" },
  { code: "START", label: "Début de séance" }, { code: "MONITORING", label: "Surveillance" }, { code: "END", label: "Fin de séance" },
  { code: "DISCONNECTION", label: "Débranchement / restitution" }, { code: "POST_ASSESSMENT", label: "Évaluation après séance" }, { code: "CLOSURE", label: "Bilan et clôture" },
] as const;
export const DIALYSIS_STAGE_LABELS = Object.fromEntries(DIALYSIS_STEPS.map((step) => [step.code, step.label]));
export const DIALYSIS_DEFAULT_SETTINGS = {
  stages: DIALYSIS_STEPS.map((step) => step.code), stageEventType: "DIALYSIS_STEP",
  closureRequirements: [
    { eventType: "DIALYSIS_PRE_ASSESSMENT", label: "Évaluation avant séance (poids, constantes)" },
    { eventType: "DIALYSIS_SESSION_PARAMETERS", label: "Paramètres de séance appliqués" },
    { eventType: "DIALYSIS_POST_ASSESSMENT", label: "Évaluation après séance (poids, constantes)" },
  ],
};
const DAYS = [["MON", "Lun"], ["TUE", "Mar"], ["WED", "Mer"], ["THU", "Jeu"], ["FRI", "Ven"], ["SAT", "Sam"], ["SUN", "Dim"]] as const;
const SLOTS = ["Matin", "Après-midi", "Soir"];

type Props = { worklist: Worklist; tab: DialysisTab; reload: () => void; openDossier: (episodeId: string) => void };
type FieldDef = { key: string; label: string; options?: string[]; long?: boolean };
type Prescription = CareEvent & { patientId?: string | null; patient?: PatientSummary };
const summaryOf = (fields: FieldDef[], values: Record<string, string>) => fields.filter((f) => values[f.key]).map((f) => `${f.label} : ${values[f.key]}`).join(" · ");
const stageOf = (episode: CareEpisode) => {
  return episode.stage ?? "ARRIVAL";
};
const num = (value: unknown) => { const n = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, "")); return Number.isFinite(n) && String(value ?? "").trim() !== "" ? n : null; };

const PRESCRIPTION_FIELDS: FieldDef[] = [
  { key: "modality", label: "Modalité", options: ["Hémodialyse", "Hémodiafiltration", "Ultrafiltration isolée"] }, { key: "sessionsPerWeek", label: "Séances / semaine" },
  { key: "durationMinutes", label: "Durée prescrite (min)" }, { key: "dialyzer", label: "Dialyseur" }, { key: "bloodFlow", label: "Débit sang (ml/min)" },
  { key: "dialysateFlow", label: "Débit dialysat (ml/min)" }, { key: "bath", label: "Bain (K, Ca, Na, bicarbonate)" }, { key: "dryWeight", label: "Poids sec (kg)" },
  { key: "anticoagulation", label: "Anticoagulation (produit, dose)" }, { key: "access", label: "Abord vasculaire", options: ["Fistule artério-veineuse", "Pontage", "Cathéter tunnelisé", "Cathéter temporaire"] },
  { key: "days", label: "Jours (ex. Lun, Mer, Ven)" }, { key: "slot", label: "Créneau", options: SLOTS }, { key: "status", label: "Statut", options: ["En cours", "Suspendue", "Arrêtée"] },
  { key: "notes", label: "Remarques", long: true },
];
const PRE_FIELDS: FieldDef[] = [
  { key: "weight", label: "Poids avant (kg)" }, { key: "bloodPressure", label: "TA" }, { key: "heartRate", label: "FC" }, { key: "temperature", label: "T°" },
  { key: "oedema", label: "Œdèmes", options: ["Absents", "Présents"] }, { key: "dyspnea", label: "Dyspnée", options: ["Absente", "Présente"] },
  { key: "accessState", label: "État de l’abord" }, { key: "lastSessionEvents", label: "Depuis la dernière séance" }, { key: "notes", label: "Remarques", long: true },
];
const PARAMETERS_FIELDS: FieldDef[] = [
  { key: "machine", label: "Générateur utilisé" }, { key: "dialyzer", label: "Dialyseur" }, { key: "bloodFlow", label: "Débit sang (ml/min)" },
  { key: "ufGoal", label: "Ultrafiltration programmée (ml)" }, { key: "duration", label: "Durée programmée (min)" }, { key: "bath", label: "Bain" },
  { key: "anticoagulation", label: "Anticoagulation administrée" }, { key: "operator", label: "Programmé par (infirmier)" },
];
const MONITORING_FIELDS: FieldDef[] = [
  { key: "bloodPressure", label: "TA (ex. 130/80)" }, { key: "heartRate", label: "FC" }, { key: "bloodFlow", label: "Débit sang lu" }, { key: "arterialPressure", label: "Pression artérielle (circuit)" },
  { key: "venousPressure", label: "Pression veineuse (circuit)" }, { key: "tmp", label: "PTM" }, { key: "ufCumulative", label: "UF cumulée (ml)" },
  { key: "symptoms", label: "Symptômes" }, { key: "actions", label: "Actions réalisées par l’équipe", long: true },
];
const POST_FIELDS: FieldDef[] = [
  { key: "weight", label: "Poids après (kg)" }, { key: "bloodPressure", label: "TA" }, { key: "heartRate", label: "FC" }, { key: "ufAchieved", label: "UF réalisée (ml)" },
  { key: "effectiveDuration", label: "Durée effective (min)" }, { key: "hemostasis", label: "Hémostase de l’abord", options: ["Normale", "Prolongée", "Difficile"] },
  { key: "condition", label: "État à la sortie" }, { key: "notes", label: "Remarques", long: true },
];
const INCIDENT_FIELDS: FieldDef[] = [
  { key: "type", label: "Type", options: ["Hypotension", "Crampes", "Malaise", "Coagulation du circuit", "Alarme générateur", "Saignement de l’abord", "Fièvre / frissons", "Autre"] },
  { key: "severity", label: "Gravité constatée", options: ["Mineure", "Modérée", "Grave"] }, { key: "description", label: "Description", long: true }, { key: "actions", label: "Mesures prises", long: true },
];
const MAINTENANCE_FIELDS: FieldDef[] = [
  { key: "machine", label: "Générateur" }, { key: "kind", label: "Intervention", options: ["Désinfection", "Détartrage", "Contrôle de conductivité", "Maintenance préventive", "Réparation"] },
  { key: "result", label: "Résultat", options: ["Conforme", "Non conforme"] }, { key: "by", label: "Réalisé par" }, { key: "notes", label: "Remarques", long: true },
];
const CONSUMABLE_FIELDS: FieldDef[] = [
  { key: "dialyzer", label: "Dialyseur (réf., lot)" }, { key: "lines", label: "Lignes" }, { key: "needles", label: "Aiguilles / kit cathéter" },
  { key: "concentrate", label: "Concentré / bain" }, { key: "saline", label: "Sérum physiologique" }, { key: "other", label: "Autres", long: true },
];

function EventForm({ title, fields, onSubmit, onClose, initial }: { title: string; fields: FieldDef[]; onSubmit: (values: Record<string, string>) => Promise<void>; onClose: () => void; initial?: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initial ?? {});
  return (
    <Dialog title={title} onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key} className={field.long ? "md:col-span-3" : ""}>
            <Field label={field.label}>
              {field.options ? <select className={inputClass} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}><option value="">—</option>{field.options.map((o) => <option key={o}>{o}</option>)}</select>
                : field.long ? <textarea className={inputClass} rows={2} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
                : <input className={inputClass} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />}
            </Field>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Valeurs relevées et saisies par l’équipe. Aulia Care ne pilote jamais le générateur. Disponible hors ligne.</p>
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button>
        <Button disabled={!Object.values(values).some((v) => v.trim())} onClick={() => void onSubmit(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])))}>Enregistrer</Button></div>
    </Dialog>
  );
}

export function DialyseModule({ worklist, tab, reload, openDossier }: Props) {
  const { unit, unitRole, episodes } = worklist;
  const writable = canWrite(unitRole);
  const [resources, setResources] = useState<CareResource[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<null | { kind: string; title: string; fields: FieldDef[]; type: string; episode?: CareEpisode; patientId?: string; initial?: Record<string, string> }>(null);
  const [newPatient, setNewPatient] = useState(false);
  const [curveOf, setCurveOf] = useState<CareEpisode | null>(null);

  const loadAux = useCallback(() => {
    void fetchResources(unit.id).then(setResources).catch(() => undefined);
    void fetchUnitEvents(unit.id, { types: ["DIALYSIS_PRESCRIPTION"], from: new Date(Date.now() - 3 * 365 * 86_400_000).toISOString() }).then(setPrescriptions).catch(() => undefined);
  }, [unit.id]);
  useEffect(() => { loadAux(); }, [loadAux, worklist.generatedAt]);
  const refresh = () => { reload(); loadAux(); };

  /** Current prescription of each patient = the latest one documented. */
  const current = useMemo(() => {
    const map = new Map<string, Prescription>();
    for (const item of prescriptions) if (item.patientId) map.set(item.patientId, item);
    return [...map.values()].sort((a, b) => patientName(a.patient).localeCompare(patientName(b.patient)));
  }, [prescriptions]);
  const active = current.filter((item) => item.payload?.status === "En cours");
  const machines = resources.filter((item) => item.kind === "MACHINE");
  const sessions = episodes;
  const inProgress = sessions.filter((episode) => ["CONNECTION", "START", "MONITORING", "END"].includes(stageOf(episode)));

  const documentEvent = async (target: { episodeId?: string; patientId?: string }, type: string, label: string, fields: FieldDef[], values: Record<string, string>) => {
    try {
      const saved = await recordCareEvent({ careUnitId: unit.id, ...target, type, summary: summaryOf(fields, values) || label, payload: values }, label);
      setNotice(isQueued(saved) ? "Hors ligne : saisie gardée sur l’appareil, envoyée au retour du réseau." : `${label} enregistré(e).`);
      setForm(null); refresh();
    } catch { /* reported globally */ }
  };
  const step = async (episode: CareEpisode, code: string) => {
    if (code === "CLOSURE") {
      try { const fresh = await fetchEpisode(episode.id); await changeEpisodeStatus(episode.id, { version: fresh.version, status: "COMPLETED", outcome: "SESSION_COMPLETED" }); refresh(); }
      catch { /* the server lists the missing mandatory documentation */ }
      return;
    }
    try {
      const saved = await recordCareEvent({ careUnitId: unit.id, episodeId: episode.id, type: "DIALYSIS_STEP", summary: DIALYSIS_STAGE_LABELS[code], payload: { stage: code } }, `${DIALYSIS_STAGE_LABELS[code]} · ${patientName(episode.patient)}`);
      setNotice(isQueued(saved) ? "Hors ligne : étape horodatée, envoyée au retour du réseau." : null);
      refresh();
    } catch { /* reported globally */ }
  };
  const startSession = async (patientId: string) => {
    try { await openEpisode({ careUnitId: unit.id, patientId, start: true, stage: "ARRIVAL", reason: "Séance de dialyse" }); refresh(); } catch { /* reported globally */ }
  };

  const nextAction = (episode: CareEpisode) => {
    const stage = stageOf(episode);
    const index = DIALYSIS_STEPS.findIndex((item) => item.code === stage);
    const next = DIALYSIS_STEPS[index + 1];
    const forms: Record<string, () => void> = {
      PRE_ASSESSMENT: () => setForm({ kind: "pre", title: `Évaluation avant séance — ${patientName(episode.patient)}`, fields: PRE_FIELDS, type: "DIALYSIS_PRE_ASSESSMENT", episode }),
      START: () => setForm({ kind: "params", title: `Paramètres de séance — ${patientName(episode.patient)}`, fields: PARAMETERS_FIELDS, type: "DIALYSIS_SESSION_PARAMETERS", episode }),
      POST_ASSESSMENT: () => setForm({ kind: "post", title: `Évaluation après séance — ${patientName(episode.patient)}`, fields: POST_FIELDS, type: "DIALYSIS_POST_ASSESSMENT", episode }),
    };
    return (
      <>
        {forms[stage] && <Button small tone="secondary" onClick={forms[stage]}>Saisir</Button>}
        {["START", "MONITORING"].includes(stage) && <Button small tone="secondary" onClick={() => setForm({ kind: "mon", title: `Surveillance — ${patientName(episode.patient)}`, fields: MONITORING_FIELDS, type: "DIALYSIS_MONITORING", episode })}>Relevé</Button>}
        {next && <Button small tone={next.code === "CLOSURE" ? "danger" : "primary"} onClick={() => void step(episode, next.code)}>→ {next.label}</Button>}
      </>
    );
  };
  const sessionRow = (episode: CareEpisode, actions?: React.ReactNode) => {
    const machine = episode.resources?.find((item) => item.kind === "MACHINE");
    return (
      <li key={episode.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-left" onClick={() => openDossier(episode.id)}>
            <p className="font-semibold">{patientName(episode.patient)} <span className="text-xs font-normal text-slate-500">{[genderLabel(episode.patient.gender), ageLabel(episode.patient)].filter(Boolean).join(" · ")}</span></p>
            <p className="text-xs text-slate-500">{DIALYSIS_STAGE_LABELS[stageOf(episode)] ?? stageOf(episode)} · arrivée {timeLabel(episode.startedAt ?? episode.createdAt)}{machine ? ` · ${machine.code}` : ""}</p>
          </button>
          {writable && <div className="flex flex-wrap gap-1">{actions}</div>}
        </div>
        <ol className="mt-2 flex flex-wrap gap-1 text-[11px]">{DIALYSIS_STEPS.map((item, index) => (
          <li key={item.code} className={`rounded px-1.5 py-0.5 ${index <= DIALYSIS_STEPS.findIndex((s) => s.code === stageOf(episode)) ? "bg-aulia-teal/15 text-aulia-navy dark:text-aulia-mist" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>{index + 1}. {item.label}</li>
        ))}</ol>
      </li>
    );
  };
  const patientRow = (item: Prescription, actions?: React.ReactNode) => (
    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div>
        <p className="font-semibold">{patientName(item.patient)} {item.payload?.status && item.payload.status !== "En cours" ? <Badge tone="amber">{String(item.payload.status)}</Badge> : null}</p>
        <p className="text-xs text-slate-500">{[item.payload?.modality, item.payload?.days, item.payload?.slot, item.payload?.durationMinutes ? `${item.payload.durationMinutes} min` : null, item.payload?.dryWeight ? `poids sec ${item.payload.dryWeight} kg` : null, item.payload?.access].filter(Boolean).join(" · ")}</p>
        <p className="text-xs text-slate-400">Prescription du {timeLabel(item.occurredAt)} · {personName(item.author)}</p>
      </div>
      {writable && <div className="flex flex-wrap gap-1">{actions}</div>}
    </li>
  );

  let content: React.ReactNode = null;
  switch (tab) {
    case "overview":
      content = (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Patients suivis" value={active.length} />
            <Stat label="Séances ouvertes" value={sessions.length} />
            <Stat label="En cours de dialyse" value={inProgress.length} />
            <Stat label="Générateurs disponibles" value={`${machines.filter((m) => m.status === "AVAILABLE").length} / ${machines.length}`} />
            <Stat label="En maintenance" value={machines.filter((m) => m.status === "MAINTENANCE").length} tone={machines.some((m) => m.status === "MAINTENANCE") ? "amber" : undefined} />
            <Stat label="Prévus aujourd’hui" value={active.filter((item) => planned(item, new Date())).length} />
          </div>
          <Card title="Séances du jour">{sessions.length ? <ul className="space-y-2">{sessions.map((episode) => sessionRow(episode, nextAction(episode)))}</ul> : <Empty>Aucune séance ouverte.</Empty>}</Card>
        </div>
      );
      break;
    case "patients":
      content = (
        <Card title={`Patients en dialyse (${active.length})`} actions={writable ? <Button small onClick={() => setNewPatient(true)}>Inscrire un patient</Button> : undefined}>
          {!current.length ? <Empty>Aucun patient. Inscrivez un patient avec sa prescription.</Empty> : (
            <ul className="space-y-2">{current.map((item) => patientRow(item, <>
              {item.payload?.status === "En cours" && !sessions.some((episode) => episode.patientId === item.patientId) && <Button small onClick={() => void startSession(item.patientId!)}>Ouvrir la séance</Button>}
            </>))}</ul>
          )}
        </Card>
      );
      break;
    case "records":
      content = <PatientRecords unitId={unit.id} patients={current} />;
      break;
    case "planning":
      content = <Planning patients={active} />;
      break;
    case "sessions":
      content = <Card title="Séances">{notice && <p className="mb-2 text-sm">{notice}</p>}{sessions.length ? <ul className="space-y-2">{sessions.map((episode) => sessionRow(episode, <>
        {nextAction(episode)}
        {!episode.resources?.some((item) => item.kind === "MACHINE") && machines.some((m) => m.status === "AVAILABLE") && (
          <select className={`${inputClass} w-auto`} value="" onChange={(e) => { const machine = machines.find((m) => m.id === e.target.value); if (machine) void updateResource(machine.id, { version: machine.version, assignedEpisodeId: episode.id }).then(refresh).catch(() => undefined); }}>
            <option value="">Générateur…</option>{machines.filter((m) => m.status === "AVAILABLE").map((m) => <option key={m.id} value={m.id}>{m.code} · {m.label}</option>)}
          </select>
        )}
      </>))}</ul> : <Empty>Aucune séance ouverte. Ouvrez-la depuis l’onglet Patients ou Planning.</Empty>}
        <p className="mt-2 text-xs text-slate-500">La clôture est refusée tant que l’évaluation avant séance, les paramètres appliqués et l’évaluation après séance ne sont pas documentés.</p></Card>;
      break;
    case "monitoring":
      content = <Card title="Surveillance per-dialytique">{notice && <p className="mb-2 text-sm">{notice}</p>}{inProgress.length ? <ul className="space-y-2">{inProgress.map((episode) => sessionRow(episode, <>
        <Button small onClick={() => setForm({ kind: "mon", title: `Surveillance — ${patientName(episode.patient)}`, fields: MONITORING_FIELDS, type: "DIALYSIS_MONITORING", episode })}>Relevé</Button>
        <Button small tone="secondary" onClick={() => setCurveOf(episode)}>Courbes</Button>
      </>))}</ul> : <Empty>Aucun patient en cours de dialyse.</Empty>}</Card>;
      break;
    case "prescriptions":
      content = <Card title="Prescriptions de dialyse (la plus récente fait foi)">{!current.length ? <Empty>Aucune prescription.</Empty> : (
        <ul className="space-y-2">{current.map((item) => patientRow(item, <Button small tone="secondary" onClick={() => setForm({
          kind: "rx", title: `Nouvelle prescription — ${patientName(item.patient)}`, fields: PRESCRIPTION_FIELDS, type: "DIALYSIS_PRESCRIPTION", patientId: item.patientId!,
          initial: Object.fromEntries(Object.entries(item.payload ?? {}).map(([k, v]) => [k, String(v ?? "")])),
        })}>Modifier (nouvelle version)</Button>))}</ul>
      )}</Card>;
      break;
    case "machines":
      content = <ResourcesBoard unitId={unit.id} kind="MACHINE" title="Générateurs de dialyse" resources={resources} role={unitRole} reload={loadAux} detailFields={[{ key: "serial", label: "N° de série" }, { key: "model", label: "Modèle" }, { key: "lastDisinfection", label: "Dernière désinfection" }]} />;
      break;
    case "consumables":
      content = <Consumables unitId={unit.id} sessions={sessions} writable={writable} onUse={(episode) => setForm({ kind: "cons", title: `Consommables — ${patientName(episode.patient)}`, fields: CONSUMABLE_FIELDS, type: "CONSUMABLE_USED", episode })} />;
      break;
    case "incidents":
      content = <Incidents unitId={unit.id} sessions={sessions} writable={writable} onDeclare={(episode) => setForm({ kind: "inc", title: `Incident — ${patientName(episode.patient)}`, fields: INCIDENT_FIELDS, type: "DIALYSIS_INCIDENT", episode })} />;
      break;
    case "maintenance":
      content = <Maintenance unitId={unit.id} writable={writable} onLog={() => setForm({ kind: "maint", title: "Maintenance d’un générateur", fields: MAINTENANCE_FIELDS, type: "MACHINE_MAINTENANCE" })} />;
      break;
    case "reports":
      content = <Reports unitId={unit.id} />;
      break;
  }

  return (
    <>
      {content}
      {form && <EventForm title={form.title} fields={form.fields} initial={form.initial} onClose={() => setForm(null)}
        onSubmit={(values) => documentEvent(form.episode ? { episodeId: form.episode.id } : form.patientId ? { patientId: form.patientId } : {}, form.type, form.title.split(" — ")[0], form.fields, values)} />}
      {newPatient && <EnrolDialog onClose={() => setNewPatient(false)} onPick={(patient) => { setNewPatient(false); setForm({ kind: "rx", title: `Prescription — ${patientName(patient)}`, fields: PRESCRIPTION_FIELDS, type: "DIALYSIS_PRESCRIPTION", patientId: patient.id, initial: { status: "En cours" } }); }} />}
      {curveOf && <CurvesDialog episode={curveOf} onClose={() => setCurveOf(null)} />}
    </>
  );
}

function planned(item: Prescription, date: Date) {
  const days = String(item.payload?.days ?? "").toLowerCase();
  const code = DAYS[(date.getDay() + 6) % 7][1].toLowerCase();
  return days.includes(code);
}

function Planning({ patients }: { patients: Prescription[] }) {
  return (
    <Card title="Planning hebdomadaire (selon les jours et créneaux prescrits)">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="p-2">Créneau</th>{DAYS.map(([code, label]) => <th key={code} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{SLOTS.map((slot) => (
            <tr key={slot} className="border-t border-slate-100 align-top dark:border-slate-800">
              <td className="p-2 font-semibold">{slot}</td>
              {DAYS.map(([code, label]) => (
                <td key={code} className="p-2">
                  {patients.filter((item) => String(item.payload?.slot ?? "") === slot && String(item.payload?.days ?? "").toLowerCase().includes(label.toLowerCase())).map((item) => (
                    <p key={item.id} className="mb-1 rounded bg-aulia-mist px-1.5 py-0.5 text-xs dark:bg-aulia-teal/10">{patientName(item.patient)}</p>
                  ))}
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Le planning se met à jour avec chaque nouvelle prescription (jours, créneau). Les patients sans créneau n’apparaissent pas.</p>
    </Card>
  );
}

function EnrolDialog({ onClose, onPick }: { onClose: () => void; onPick: (patient: PatientSummary) => void }) {
  return <Dialog title="Inscrire un patient en dialyse" onClose={onClose}><Field label="Dossier du patient"><PatientSearch onPick={onPick} /></Field><p className="mt-2 text-xs text-slate-500">La prescription initiale est saisie à l’étape suivante par le néphrologue.</p></Dialog>;
}

function PatientRecords({ unitId, patients }: { unitId: string; patients: Prescription[] }) {
  const [patientId, setPatientId] = useState("");
  const [events, setEvents] = useState<CareEvent[]>([]);
  useEffect(() => {
    if (!patientId) { setEvents([]); return; }
    void fetchUnitEvents(unitId, { types: ["DIALYSIS_PRESCRIPTION", "DIALYSIS_MONITORING", "DIALYSIS_INCIDENT", "CONSUMABLE_USED", "RESULT_REPORTED"], patientId, from: new Date(Date.now() - 365 * 86_400_000).toISOString() }).then(setEvents).catch(() => setEvents([]));
  }, [unitId, patientId]);
  return (
    <Card title="Dossier de dialyse">
      <Field label="Patient"><select className={inputClass} value={patientId} onChange={(e) => setPatientId(e.target.value)}><option value="">Choisir…</option>{patients.map((item) => <option key={item.id} value={item.patientId ?? ""}>{patientName(item.patient)}</option>)}</select></Field>
      {patientId && (events.length ? <ol className="mt-3 space-y-1 text-sm">{[...events].reverse().map((event) => <li key={event.id} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800"><span className="text-xs text-slate-500">{timeLabel(event.occurredAt)} · {event.type === "DIALYSIS_PRESCRIPTION" ? "Prescription" : event.type === "DIALYSIS_INCIDENT" ? "Incident" : event.type === "CONSUMABLE_USED" ? "Consommables" : event.type === "RESULT_REPORTED" ? "Résultat" : "Surveillance"}</span><p>{event.summary}</p></li>)}</ol> : <p className="mt-2 text-sm text-slate-500">Aucune donnée sur 12 mois.</p>)}
      <p className="mt-2 text-xs text-slate-500">Chaque séance a aussi son dossier complet (cliquer sur le patient dans l’onglet Séances ou Historique).</p>
    </Card>
  );
}

function CurvesDialog({ episode, onClose }: { episode: CareEpisode; onClose: () => void }) {
  const [entries, setEntries] = useState<CareEvent[] | null>(null);
  useEffect(() => { void fetchEpisode(episode.id).then((detail) => setEntries(detail.events.filter((event) => event.type === "DIALYSIS_MONITORING" && !detail.events.some((other) => other.correctsEventId === event.id)))).catch(() => setEntries([])); }, [episode.id]);
  const series = (key: string, pick: (value: unknown) => number | null) => (entries ?? []).map((event) => ({ at: new Date(event.occurredAt).getTime(), value: pick(event.payload?.[key]) })).filter((p) => p.value !== null) as Array<{ at: number; value: number }>;
  const systolic = series("bloodPressure", (v) => num(String(v ?? "").split("/")[0]));
  const flow = series("bloodFlow", num);
  const venous = series("venousPressure", num);
  const chart = (title: string, points: Array<{ at: number; value: number }>, color: string) => {
    if (points.length < 1) return <p key={title} className="text-xs text-slate-500">{title} : aucune valeur.</p>;
    const W = 620, H = 120, min = Math.min(...points.map((p) => p.value)), max = Math.max(...points.map((p) => p.value)), t0 = points[0].at, t1 = Math.max(points[points.length - 1].at, t0 + 60_000);
    const x = (t: number) => 40 + ((t - t0) / (t1 - t0)) * (W - 50), y = (v: number) => 10 + (1 - (v - min) / (max - min || 1)) * (H - 30);
    return (
      <svg key={title} viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" role="img" aria-label={title}>
        <text x="40" y="12" fontSize="11" fill="#0A1D3A">{title} ({min}–{max})</text>
        <polyline fill="none" stroke={color} strokeWidth="2" points={points.map((p) => `${x(p.at)},${y(p.value)}`).join(" ")} />
        {points.map((p, i) => <g key={i}><circle cx={x(p.at)} cy={y(p.value)} r="3" fill={color} /><text x={x(p.at)} y={H - 6} fontSize="9" textAnchor="middle" fill="#64748b">{new Date(p.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</text></g>)}
      </svg>
    );
  };
  return (
    <Dialog title={`Courbes de séance — ${patientName(episode.patient)}`} onClose={onClose} wide>
      {!entries ? <p className="text-sm text-slate-500">Chargement…</p> : <div className="space-y-2">{chart("TA systolique", systolic, "#dc2626")}{chart("Débit sang (ml/min)", flow, "#0d9488")}{chart("Pression veineuse", venous, "#2563eb")}</div>}
      <p className="mt-2 text-xs text-slate-500">Courbes tracées à partir des relevés saisis. Aucune consigne n’est envoyée au générateur.</p>
    </Dialog>
  );
}

function Consumables({ unitId, sessions, writable, onUse }: { unitId: string; sessions: CareEpisode[]; writable: boolean; onUse: (episode: CareEpisode) => void }) {
  const [pharmacy, setPharmacy] = useState<CareUnit | null>(null);
  const [request, setRequest] = useState({ label: "", reason: "" });
  const [sent, setSent] = useState<string | null>(null);
  const [events, setEvents] = useState<CareEvent[]>([]);
  useEffect(() => {
    void fetchClinicUnits().then((units) => setPharmacy(units.find((item) => item.kind === "PHARMACY") ?? null)).catch(() => undefined);
    void fetchUnitEvents(unitId, { types: ["CONSUMABLE_USED"], from: new Date(Date.now() - 30 * 86_400_000).toISOString() }).then(setEvents).catch(() => undefined);
  }, [unitId]);
  const ask = async () => {
    if (!pharmacy || !sessions[0]) return;
    try {
      await createServiceRequest({ patientId: sessions[0].patientId, requesterUnitId: unitId, performerUnitId: pharmacy.id, category: "STOCK", code: "REAPPRO-DIALYSE", label: request.label.trim(), reason: request.reason.trim() || undefined, priority: "URGENT" });
      setSent("Demande envoyée à la pharmacie."); setRequest({ label: "", reason: "" });
    } catch { /* reported globally */ }
  };
  return (
    <div className="space-y-4">
      <Card title="Consommables par séance">{sessions.length ? <ul className="space-y-1 text-sm">{sessions.map((episode) => <li key={episode.id} className="flex justify-between gap-2"><span>{patientName(episode.patient)}</span>{writable && <Button small tone="secondary" onClick={() => onUse(episode)}>Déclarer les consommables</Button>}</li>)}</ul> : <Empty>Aucune séance ouverte.</Empty>}</Card>
      <Card title="Réapprovisionnement (lien avec la pharmacie)">
        {!pharmacy ? <Empty>Aucune unité « Pharmacie » n’est déclarée : créez-la dans Administration › Unités de soins pour envoyer les demandes de stock.</Empty> : (
          <div className="grid gap-2 md:grid-cols-[2fr_2fr_auto]">
            <input className={inputClass} placeholder="Articles et quantités (ex. 20 dialyseurs F8)" value={request.label} onChange={(e) => setRequest({ ...request, label: e.target.value })} />
            <input className={inputClass} placeholder="Motif (stock bas, rupture…)" value={request.reason} onChange={(e) => setRequest({ ...request, reason: e.target.value })} />
            <Button disabled={!writable || request.label.trim().length < 2 || !sessions.length} onClick={() => void ask()}>Envoyer</Button>
          </div>
        )}
        {sent && <p className="mt-2 text-sm">{sent}</p>}
        <p className="mt-2 text-xs text-slate-500">La demande est suivie par la pharmacie dans ses unités (acceptée → en cours → terminée). Le stock officiel reste géré dans le module Pharmacie.</p>
      </Card>
      <Card title="Consommés sur 30 jours">{events.length ? <ul className="space-y-1 text-sm">{[...events].reverse().map((event) => <li key={event.id}><span className="text-xs text-slate-500">{timeLabel(event.occurredAt)}</span> {event.summary}</li>)}</ul> : <Empty>Aucune déclaration.</Empty>}</Card>
    </div>
  );
}

function Incidents({ unitId, sessions, writable, onDeclare }: { unitId: string; sessions: CareEpisode[]; writable: boolean; onDeclare: (episode: CareEpisode) => void }) {
  const [events, setEvents] = useState<CareEvent[]>([]);
  useEffect(() => { void fetchUnitEvents(unitId, { types: ["DIALYSIS_INCIDENT"], from: new Date(Date.now() - 90 * 86_400_000).toISOString() }).then(setEvents).catch(() => undefined); }, [unitId]);
  return (
    <div className="space-y-4">
      <Card title="Déclarer un incident">{sessions.length ? <ul className="space-y-1 text-sm">{sessions.map((episode) => <li key={episode.id} className="flex justify-between gap-2"><span>{patientName(episode.patient)}</span>{writable && <Button small tone="danger" onClick={() => onDeclare(episode)}>Incident</Button>}</li>)}</ul> : <Empty>Aucune séance ouverte.</Empty>}</Card>
      <Card title={`Incidents sur 90 jours (${events.length})`}>{events.length ? <ul className="space-y-1 text-sm">{[...events].reverse().map((event) => <li key={event.id} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800"><span className="text-xs text-slate-500">{timeLabel(event.occurredAt)} · {personName(event.author)}</span><p>{event.summary}</p></li>)}</ul> : <Empty>Aucun incident déclaré.</Empty>}</Card>
    </div>
  );
}

function Maintenance({ unitId, writable, onLog }: { unitId: string; writable: boolean; onLog: () => void }) {
  const [events, setEvents] = useState<CareEvent[]>([]);
  useEffect(() => { void fetchUnitEvents(unitId, { types: ["MACHINE_MAINTENANCE"], from: new Date(Date.now() - 180 * 86_400_000).toISOString() }).then(setEvents).catch(() => undefined); }, [unitId]);
  return (
    <Card title="Journal de maintenance des générateurs" actions={writable ? <Button small onClick={onLog}>Consigner une intervention</Button> : undefined}>
      {events.length ? <ul className="space-y-1 text-sm">{[...events].reverse().map((event) => <li key={event.id} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800"><span className="text-xs text-slate-500">{timeLabel(event.occurredAt)} · {personName(event.author)}</span><p>{event.summary}</p></li>)}</ul> : <Empty>Aucune intervention consignée sur 6 mois.</Empty>}
      <p className="mt-2 text-xs text-slate-500">Pour retirer un générateur du service, passez-le « En maintenance » dans l’onglet Machines (motif obligatoire).</p>
    </Card>
  );
}

function Reports({ unitId }: { unitId: string }) {
  const [days, setDays] = useState(30);
  const [sessions, setSessions] = useState<CareEpisode[]>([]);
  const [incidents, setIncidents] = useState<CareEvent[]>([]);
  useEffect(() => {
    void fetchUnitHistory(unitId, days).then(setSessions).catch(() => setSessions([]));
    void fetchUnitEvents(unitId, { types: ["DIALYSIS_INCIDENT"], from: new Date(Date.now() - days * 86_400_000).toISOString() }).then(setIncidents).catch(() => setIncidents([]));
  }, [unitId, days]);
  const completed = sessions.filter((item) => item.status === "COMPLETED").length;
  const patients = new Set(sessions.map((item) => item.patientId)).size;
  const byType = incidents.reduce<Record<string, number>>((acc, event) => { const key = String(event.payload?.type ?? "Autre"); acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  return (
    <Card title="Activité" actions={<select className={`${inputClass} w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option></select>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Séances réalisées" value={completed} /><Stat label="Patients dialysés" value={patients} />
        <Stat label="Incidents déclarés" value={incidents.length} /><Stat label="Incidents / séance" value={completed ? (incidents.length / completed).toFixed(2) : "—"} />
      </div>
      {Object.keys(byType).length > 0 && <ul className="mt-3 text-sm">{Object.entries(byType).map(([type, count]) => <li key={type}>{type} : {count}</li>)}</ul>}
    </Card>
  );
}
