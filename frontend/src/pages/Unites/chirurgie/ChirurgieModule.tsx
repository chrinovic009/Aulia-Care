import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ageLabel, changeEpisodeStatus, fetchEpisode, fetchResources, fetchUnitHistory, genderLabel, openEpisode, patientName, personName, PRIORITY_LABELS,
  recordCareEvent, timeLabel, updateResource,
  type CareEpisode, type CareEvent, type CareResource, type EpisodeDetail, type Worklist,
} from "../../../api/careWorkflow";
import { useAuth } from "../../../context/AuthContext";
import { isQueued } from "../../../offline/offlineQueue";
import { ResourcesBoard } from "../ResourcesBoard";
import { canWrite, PatientSearch, TransferDialog } from "../shared";
import { Badge, Button, Card, Dialog, Empty, Field, inputClass, PriorityBadge, Stat } from "../ui";

export const SURGERY_TABS = [
  { id: "overview", label: "Vue d’ensemble" }, { id: "requests", label: "Demandes opératoires" }, { id: "schedule", label: "Programmation" },
  { id: "preop", label: "Préopératoire" }, { id: "record", label: "Dossier opératoire" }, { id: "theatre", label: "Bloc opératoire" },
  { id: "anesthesia", label: "Anesthésie" }, { id: "procedure", label: "Intervention" }, { id: "checklists", label: "Checklists de sécurité" },
  { id: "recovery", label: "Réveil & surveillance" }, { id: "postop", label: "Suites postopératoires" }, { id: "implants", label: "Matériel & implants" },
  { id: "sterilization", label: "Stérilisation & instruments" }, { id: "reports", label: "Rapports" },
] as const;
export type SurgeryTab = (typeof SURGERY_TABS)[number]["id"];

/** Case progress, documented step by step (offline-capable through settings.stageEventType). */
export const SURGERY_STEPS = [
  { code: "SCHEDULED", label: "Programmé" }, { code: "PREOP", label: "Préparation" }, { code: "IN_ROOM", label: "Entrée en salle" },
  { code: "ANESTHESIA", label: "Anesthésie" }, { code: "INCISION", label: "Incision" }, { code: "CLOSURE", label: "Fermeture" },
  { code: "OUT_OF_ROOM", label: "Sortie de salle" }, { code: "RECOVERY", label: "Salle de réveil" }, { code: "POSTOP", label: "Suites opératoires" },
] as const;
export const SURGERY_STAGE_LABELS = Object.fromEntries(SURGERY_STEPS.map((step) => [step.code, step.label]));

/**
 * Default checklist, modelled on the WHO Surgical Safety Checklist. The
 * establishment adapts it (Administration › Unités de soins) before real use.
 */
export const DEFAULT_SURGICAL_CHECKLIST = [
  { phase: "SIGN_IN", label: "Avant l’induction anesthésique", items: [
    "Identité du patient confirmée", "Site opératoire confirmé et marqué", "Intervention confirmée", "Consentement éclairé signé",
    "Vérification de la sécurité anesthésique faite", "Oxymètre en place et fonctionnel", "Allergies connues vérifiées",
    "Risque d’intubation difficile évalué", "Risque de saignement > 500 ml évalué (accès veineux, sang disponible)",
  ] },
  { phase: "TIME_OUT", label: "Avant l’incision", items: [
    "Membres de l’équipe présentés par nom et fonction", "Patient, site et intervention confirmés à voix haute",
    "Étapes critiques et durée prévue annoncées par le chirurgien", "Points de vigilance annoncés par l’anesthésiste",
    "Stérilité du matériel confirmée par l’infirmier", "Antibioprophylaxie faite (ou non indiquée)", "Imagerie essentielle disponible",
  ] },
  { phase: "SIGN_OUT", label: "Avant la sortie de salle", items: [
    "Intitulé de l’intervention enregistré", "Compte des instruments, compresses et aiguilles correct", "Prélèvements étiquetés",
    "Problèmes de matériel signalés", "Consignes postopératoires transmises à l’équipe de réveil",
  ] },
];
export const SURGERY_DEFAULT_SETTINGS = { stages: SURGERY_STEPS.map((step) => step.code), stageEventType: "SURGERY_STEP", checklist: DEFAULT_SURGICAL_CHECKLIST, checklistValidated: false };

type Props = { worklist: Worklist; tab: SurgeryTab; reload: () => void; openDossier: (episodeId: string) => void };
type FieldDef = { key: string; label: string; options?: string[]; long?: boolean };
const yesNo = ["Oui", "Non"];

const stageOf = (episode: CareEpisode) => {
  const step = (episode.events ?? []).find((event) => event.type === "SURGERY_STEP")?.payload?.stage;
  return typeof step === "string" ? step : episode.stage ?? "SCHEDULED";
};
const scheduleOf = (episode: CareEpisode) => {
  const event = (episode.events ?? []).find((item) => item.type === "SURGERY_SCHEDULED");
  const payload = (event?.payload ?? {}) as { start?: string; durationMinutes?: number; room?: string; procedure?: string; surgeon?: string };
  return payload.start ? { ...payload, startMs: new Date(payload.start).getTime(), endMs: new Date(payload.start).getTime() + (Number(payload.durationMinutes) || 0) * 60_000 } : null;
};
const summaryOf = (fields: FieldDef[], values: Record<string, string>) => fields.filter((field) => values[field.key]).map((field) => `${field.label} : ${values[field.key]}`).join(" · ");

function EventForm({ title, fields, onSubmit, onClose }: { title: string; fields: FieldDef[]; onSubmit: (values: Record<string, string>) => Promise<void>; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <Dialog title={title} onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key} className={field.long ? "md:col-span-3" : ""}>
            <Field label={field.label}>
              {field.options ? (
                <select className={inputClass} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}><option value="">—</option>{field.options.map((o) => <option key={o}>{o}</option>)}</select>
              ) : field.long ? (
                <textarea className={inputClass} rows={3} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
              ) : <input className={inputClass} value={values[field.key] ?? ""} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />}
            </Field>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Horodaté et signé ; disponible hors ligne. Les scores sont ceux que vous évaluez.</p>
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button>
        <Button disabled={!Object.values(values).some((v) => v.trim())} onClick={() => void onSubmit(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])))}>Enregistrer</Button></div>
    </Dialog>
  );
}

const PREOP_FIELDS: FieldDef[] = [
  { key: "consent", label: "Consentement signé", options: yesNo }, { key: "fasting", label: "À jeun depuis (heure)" }, { key: "siteMarked", label: "Site marqué", options: [...yesNo, "Sans objet"] },
  { key: "allergiesChecked", label: "Allergies vérifiées", options: yesNo }, { key: "workup", label: "Bilan préopératoire disponible", options: yesNo }, { key: "bloodAvailable", label: "Sang disponible", options: [...yesNo, "Non nécessaire"] },
  { key: "premedication", label: "Prémédication" }, { key: "antibiotic", label: "Antibioprophylaxie prescrite" }, { key: "jewelry", label: "Bijoux / prothèses retirés", options: yesNo },
  { key: "notes", label: "Remarques", long: true },
];
const ANESTHESIA_FIELDS: FieldDef[] = [
  { key: "type", label: "Type d’anesthésie", options: ["Générale", "Rachianesthésie", "Péridurale", "Locorégionale", "Locale", "Sédation"] },
  { key: "asa", label: "Classe ASA (évaluée)", options: ["I", "II", "III", "IV", "V", "VI"] }, { key: "airway", label: "Abord des voies aériennes" },
  { key: "drugs", label: "Agents et doses administrés", long: true }, { key: "bloodPressure", label: "TA" }, { key: "heartRate", label: "FC" },
  { key: "spo2", label: "SpO₂" }, { key: "etco2", label: "EtCO₂" }, { key: "fluids", label: "Remplissage / transfusion" },
  { key: "events", label: "Événements per-anesthésiques", long: true },
];
const OPERATIVE_FIELDS: FieldDef[] = [
  { key: "procedure", label: "Intervention réalisée" }, { key: "surgeon", label: "Opérateur" }, { key: "assistants", label: "Aides opératoires" },
  { key: "approach", label: "Voie d’abord" }, { key: "findings", label: "Constatations", long: true }, { key: "steps", label: "Gestes réalisés", long: true },
  { key: "bloodLoss", label: "Pertes sanguines estimées (ml)" }, { key: "drains", label: "Drains" }, { key: "specimens", label: "Prélèvements envoyés" },
  { key: "incidents", label: "Incidents", long: true }, { key: "postopOrders", label: "Prescriptions et consignes postopératoires", long: true },
];
const RECOVERY_FIELDS: FieldDef[] = [
  { key: "bloodPressure", label: "TA" }, { key: "heartRate", label: "FC" }, { key: "spo2", label: "SpO₂" }, { key: "temperature", label: "T°" },
  { key: "consciousness", label: "Conscience" }, { key: "pain", label: "Douleur (0-10)" }, { key: "nausea", label: "Nausées / vomissements", options: ["Absents", "Présents"] },
  { key: "aldrete", label: "Score de réveil utilisé (nom et valeur)" }, { key: "dressing", label: "Pansement / drains" }, { key: "notes", label: "Remarques", long: true },
];
const POSTOP_FIELDS: FieldDef[] = [
  { key: "dayAfterSurgery", label: "J post-opératoire" }, { key: "bloodPressure", label: "TA" }, { key: "temperature", label: "T°" }, { key: "pain", label: "Douleur (0-10)" },
  { key: "wound", label: "Cicatrice", options: ["Propre", "Inflammatoire", "Écoulement", "Désunion"] }, { key: "drains", label: "Drains (débit)" },
  { key: "transit", label: "Transit / alimentation" }, { key: "mobilisation", label: "Lever / mobilisation" }, { key: "notes", label: "Remarques", long: true },
];
const IMPLANT_FIELDS: FieldDef[] = [
  { key: "name", label: "Matériel / implant" }, { key: "manufacturer", label: "Fabricant" }, { key: "reference", label: "Référence" },
  { key: "lot", label: "N° de lot" }, { key: "serial", label: "N° de série" }, { key: "expiry", label: "Péremption" }, { key: "site", label: "Site d’implantation" },
];

export function ChirurgieModule({ worklist, tab, reload, openDossier }: Props) {
  const { unit, unitRole, episodes } = worklist;
  const writable = canWrite(unitRole);
  const checklist = ((unit.settings as { checklist?: typeof DEFAULT_SURGICAL_CHECKLIST } | null)?.checklist?.length ? (unit.settings as { checklist: typeof DEFAULT_SURGICAL_CHECKLIST }).checklist : DEFAULT_SURGICAL_CHECKLIST);
  const checklistValidated = Boolean((unit.settings as { checklistValidated?: boolean } | null)?.checklistValidated);
  const [resources, setResources] = useState<CareResource[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<null | { kind: "preop" | "anesthesia" | "operative" | "recovery" | "postop" | "implant"; episode: CareEpisode }>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ requestId?: string; patientId?: string; label?: string; priority?: CareEpisode["priority"] } | null>(null);
  const [checklistOf, setChecklistOf] = useState<CareEpisode | null>(null);
  const [transferTarget, setTransferTarget] = useState<CareEpisode | null>(null);
  const loadResources = useCallback(() => { void fetchResources(unit.id).then(setResources).catch(() => undefined); }, [unit.id]);
  useEffect(() => { loadResources(); }, [loadResources, worklist.generatedAt]);
  const refresh = () => { reload(); loadResources(); };

  const at = (...codes: string[]) => episodes.filter((episode) => codes.includes(stageOf(episode)));
  const scheduled = useMemo(() => episodes.filter((episode) => scheduleOf(episode)).sort((a, b) => scheduleOf(a)!.startMs - scheduleOf(b)!.startMs), [episodes]);
  const inTheatre = at("IN_ROOM", "ANESTHESIA", "INCISION", "CLOSURE");
  const rooms = resources.filter((item) => item.kind === "ROOM");

  const step = async (episode: CareEpisode, code: string) => {
    try {
      const saved = await recordCareEvent({ careUnitId: unit.id, episodeId: episode.id, type: "SURGERY_STEP", summary: SURGERY_STAGE_LABELS[code], payload: { stage: code } }, `${SURGERY_STAGE_LABELS[code]} · ${patientName(episode.patient)}`);
      setNotice(isQueued(saved) ? "Hors ligne : étape horodatée sur l’appareil, envoyée au retour du réseau." : null);
      refresh();
    } catch { /* reported globally */ }
  };
  const documentEvent = async (episode: CareEpisode, type: string, label: string, fields: FieldDef[], values: Record<string, string>) => {
    try {
      const saved = await recordCareEvent({ careUnitId: unit.id, episodeId: episode.id, type, summary: summaryOf(fields, values) || label, payload: values }, `${label} · ${patientName(episode.patient)}`);
      setNotice(isQueued(saved) ? "Hors ligne : saisie gardée sur l’appareil, envoyée au retour du réseau." : `${label} enregistré(e).`);
      setForm(null); refresh();
    } catch { /* reported globally */ }
  };

  const row = (episode: CareEpisode, actions?: React.ReactNode) => {
    const plan = scheduleOf(episode);
    return (
      <li key={episode.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openDossier(episode.id)}>
          <p className="font-semibold">{patientName(episode.patient)} <span className="text-xs font-normal text-slate-500">{[genderLabel(episode.patient.gender), ageLabel(episode.patient)].filter(Boolean).join(" · ")}</span></p>
          <p className="text-xs text-slate-500">
            {plan?.procedure || episode.reason || "Intervention à préciser"} · {SURGERY_STAGE_LABELS[stageOf(episode)] ?? stageOf(episode)}
            {plan ? ` · ${timeLabel(plan.start)} (${plan.durationMinutes} min annoncées)${plan.room ? ` · ${plan.room}` : ""}${plan.surgeon ? ` · ${plan.surgeon}` : ""}` : ""}
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-1"><PriorityBadge priority={episode.priority} />{writable && actions}</div>
      </li>
    );
  };
  const list = (items: CareEpisode[], empty: string, actions?: (episode: CareEpisode) => React.ReactNode) =>
    items.length ? <ul className="space-y-2">{items.map((episode) => row(episode, actions?.(episode)))}</ul> : <Empty>{empty}</Empty>;
  const nextStep = (episode: CareEpisode) => {
    const index = SURGERY_STEPS.findIndex((item) => item.code === stageOf(episode));
    const next = SURGERY_STEPS[index + 1];
    return next ? <Button small onClick={() => void step(episode, next.code)}>→ {next.label}</Button> : null;
  };

  let content: React.ReactNode = null;
  switch (tab) {
    case "overview":
      content = (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Demandes à programmer" value={worklist.incomingRequests.length} tone={worklist.incomingRequests.length ? "amber" : undefined} />
            <Stat label="Programmés" value={at("SCHEDULED", "PREOP").length} />
            <Stat label="Au bloc" value={inTheatre.length} tone={inTheatre.length ? "amber" : undefined} />
            <Stat label="En salle de réveil" value={at("OUT_OF_ROOM", "RECOVERY").length} />
            <Stat label="Suites opératoires" value={at("POSTOP").length} />
            <Stat label="Salles disponibles" value={`${rooms.filter((item) => item.status === "AVAILABLE").length} / ${rooms.length}`} />
          </div>
          <Card title="Au bloc maintenant">{list(inTheatre, "Aucune intervention en cours.", nextStep)}</Card>
          <Card title="Programme à venir">{list(scheduled.filter((episode) => ["SCHEDULED", "PREOP"].includes(stageOf(episode))), "Rien de programmé.")}</Card>
        </div>
      );
      break;
    case "requests":
      content = (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={`Demandes reçues (${worklist.incomingRequests.length})`}>
            {!worklist.incomingRequests.length ? <Empty>Aucune demande opératoire en attente.</Empty> : (
              <ul className="space-y-2 text-sm">{worklist.incomingRequests.map((request) => (
                <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                  <span><strong>{request.label}</strong> · {patientName(request.patient)} · de {request.requesterUnit?.name ?? "—"} · {PRIORITY_LABELS[request.priority]}{request.reason ? ` · ${request.reason}` : ""}</span>
                  {writable && request.patient && <Button small onClick={() => setScheduleTarget({ requestId: request.id, patientId: request.patient!.id, label: request.label, priority: request.priority })}>Programmer</Button>}
                </li>
              ))}</ul>
            )}
          </Card>
          <Card title="Programmer sans demande (consultation de chirurgie)">
            {writable ? <PatientSearch onPick={(patient) => setScheduleTarget({ patientId: patient.id })} /> : <Empty>Lecture seule.</Empty>}
          </Card>
        </div>
      );
      break;
    case "schedule":
      content = <ScheduleBoard episodes={scheduled} rooms={rooms} onOpen={openDossier} />;
      break;
    case "preop":
      content = <Card title="Préparation préopératoire">{notice && <p className="mb-2 text-sm">{notice}</p>}{list(at("SCHEDULED", "PREOP"), "Aucun patient à préparer.", (episode) => <>
        <Button small tone="secondary" onClick={() => setForm({ kind: "preop", episode })}>Check-list préopératoire</Button>{nextStep(episode)}
      </>)}</Card>;
      break;
    case "record":
      content = <Card title="Dossiers opératoires (ouvrez un patient pour sa chronologie complète)">{list(episodes, "Aucun dossier opératoire ouvert.", (episode) => <Button small tone="secondary" onClick={() => openDossier(episode.id)}>Ouvrir</Button>)}</Card>;
      break;
    case "theatre":
      content = (
        <div className="space-y-4">
          <ResourcesBoard unitId={unit.id} kind="ROOM" title="Salles d’opération" resources={resources} role={unitRole} reload={loadResources} detailFields={[{ key: "type", label: "Type / spécialité" }]} />
          <Card title="Entrée en salle">{list(at("PREOP", "SCHEDULED"), "Aucun patient prêt.", (episode) => {
            const free = rooms.filter((item) => item.status === "AVAILABLE");
            return free.length ? (
              <select className={`${inputClass} w-auto`} value="" onChange={(e) => { const room = free.find((item) => item.id === e.target.value); if (room) void updateResource(room.id, { version: room.version, assignedEpisodeId: episode.id }).then(() => step(episode, "IN_ROOM")).catch(() => undefined); }}>
                <option value="">Installer en salle…</option>{free.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.label}</option>)}
              </select>
            ) : <Badge tone="amber">Aucune salle libre</Badge>;
          })}</Card>
          <Card title="En salle">{list(inTheatre, "Aucune salle occupée.", nextStep)}</Card>
        </div>
      );
      break;
    case "anesthesia":
      content = <Card title="Anesthésie">{notice && <p className="mb-2 text-sm">{notice}</p>}{list([...at("PREOP", "SCHEDULED"), ...inTheatre], "Aucun patient.", (episode) => <Button small onClick={() => setForm({ kind: "anesthesia", episode })}>Feuille d’anesthésie</Button>)}</Card>;
      break;
    case "procedure":
      content = <Card title="Intervention">{notice && <p className="mb-2 text-sm">{notice}</p>}{list(inTheatre, "Aucune intervention en cours.", (episode) => <>{nextStep(episode)}<Button small tone="secondary" onClick={() => setForm({ kind: "operative", episode })}>Compte rendu opératoire</Button></>)}</Card>;
      break;
    case "checklists":
      content = (
        <>
          {!checklistValidated && <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Check-list par défaut (inspirée de la liste OMS), non validée par l’établissement. Adaptez-la et validez-la dans Administration › Unités de soins.</p>}
          <Card title="Check-lists de sécurité">{list(episodes.filter((episode) => ["SCHEDULED", "PREOP", "IN_ROOM", "ANESTHESIA", "INCISION", "CLOSURE", "OUT_OF_ROOM"].includes(stageOf(episode))), "Aucune intervention en cours.", (episode) => <Button small onClick={() => setChecklistOf(episode)}>Ouvrir la check-list</Button>)}</Card>
        </>
      );
      break;
    case "recovery":
      content = <Card title="Salle de réveil">{notice && <p className="mb-2 text-sm">{notice}</p>}{list(at("OUT_OF_ROOM", "RECOVERY"), "Aucun patient en salle de réveil.", (episode) => <>
        <Button small tone="secondary" onClick={() => setForm({ kind: "recovery", episode })}>Surveillance</Button>{nextStep(episode)}
      </>)}</Card>;
      break;
    case "postop":
      content = <Card title="Suites postopératoires">{notice && <p className="mb-2 text-sm">{notice}</p>}{list(at("POSTOP"), "Aucun patient.", (episode) => <>
        <Button small tone="secondary" onClick={() => setForm({ kind: "postop", episode })}>Visite postopératoire</Button>
        <Button small tone="secondary" onClick={() => setTransferTarget(episode)}>Transférer (hospitalisation…)</Button>
        <CloseCaseButton episode={episode} onDone={refresh} />
      </>)}</Card>;
      break;
    case "implants":
      content = (
        <div className="space-y-4">
          <Card title="Traçabilité du matériel implanté">{list(episodes, "Aucun patient.", (episode) => <Button small onClick={() => setForm({ kind: "implant", episode })}>Déclarer un implant</Button>)}</Card>
          <ResourcesBoard unitId={unit.id} kind="EQUIPMENT" title="Matériel du bloc" resources={resources} role={unitRole} reload={loadResources} detailFields={[{ key: "serial", label: "N° de série" }, { key: "nextCheck", label: "Prochaine maintenance" }]} />
        </div>
      );
      break;
    case "sterilization":
      content = (
        <>
          <p className="mb-3 text-sm text-slate-600">Boîtes et instruments : « Disponible » = stérile et prête ; « Engagé » = utilisée pour un patient ; « En maintenance » = en cycle de stérilisation (motif : n° de cycle).</p>
          <ResourcesBoard unitId={unit.id} kind="MACHINE" title="Boîtes d’instruments" resources={resources} role={unitRole} reload={loadResources} detailFields={[{ key: "content", label: "Contenu" }, { key: "lastCycle", label: "Dernier cycle" }, { key: "expiry", label: "Péremption stérilité" }]} />
        </>
      );
      break;
    case "reports":
      content = <SurgeryReports unitId={unit.id} />;
      break;
  }

  return (
    <>
      {content}
      {form?.kind === "preop" && <EventForm title={`Préopératoire — ${patientName(form.episode.patient)}`} fields={PREOP_FIELDS} onClose={() => setForm(null)} onSubmit={(v) => documentEvent(form.episode, "PREOP_CHECK", "Préparation préopératoire", PREOP_FIELDS, v)} />}
      {form?.kind === "anesthesia" && <EventForm title={`Anesthésie — ${patientName(form.episode.patient)}`} fields={ANESTHESIA_FIELDS} onClose={() => setForm(null)} onSubmit={(v) => documentEvent(form.episode, "ANESTHESIA_RECORD", "Feuille d’anesthésie", ANESTHESIA_FIELDS, v)} />}
      {form?.kind === "operative" && <EventForm title={`Compte rendu opératoire — ${patientName(form.episode.patient)}`} fields={OPERATIVE_FIELDS} onClose={() => setForm(null)} onSubmit={(v) => documentEvent(form.episode, "OPERATIVE_REPORT", "Compte rendu opératoire", OPERATIVE_FIELDS, v)} />}
      {form?.kind === "recovery" && <EventForm title={`Réveil — ${patientName(form.episode.patient)}`} fields={RECOVERY_FIELDS} onClose={() => setForm(null)} onSubmit={(v) => documentEvent(form.episode, "RECOVERY_OBSERVATION", "Surveillance en salle de réveil", RECOVERY_FIELDS, v)} />}
      {form?.kind === "postop" && <EventForm title={`Suites — ${patientName(form.episode.patient)}`} fields={POSTOP_FIELDS} onClose={() => setForm(null)} onSubmit={(v) => documentEvent(form.episode, "POSTOP_FOLLOWUP", "Visite postopératoire", POSTOP_FIELDS, v)} />}
      {form?.kind === "implant" && <EventForm title={`Implant — ${patientName(form.episode.patient)}`} fields={IMPLANT_FIELDS} onClose={() => setForm(null)} onSubmit={(v) => documentEvent(form.episode, "IMPLANT_USED", "Implant déclaré", IMPLANT_FIELDS, v)} />}
      {scheduleTarget && <ScheduleDialog unitId={unit.id} target={scheduleTarget} rooms={rooms} scheduled={scheduled} onClose={() => setScheduleTarget(null)} onDone={() => { setScheduleTarget(null); refresh(); }} />}
      {checklistOf && <ChecklistDialog episode={checklistOf} unitId={unit.id} checklist={checklist} onClose={() => setChecklistOf(null)} />}
      {transferTarget && <TransferDialog episode={transferTarget} unit={unit} preset={{ toKind: "HOSPITALIZATION" }} onClose={() => setTransferTarget(null)} onDone={() => { setTransferTarget(null); refresh(); }} />}
    </>
  );
}

function ScheduleDialog({ unitId, target, rooms, scheduled, onClose, onDone }: {
  unitId: string; target: { requestId?: string; patientId?: string; label?: string; priority?: CareEpisode["priority"] }; rooms: CareResource[]; scheduled: CareEpisode[]; onClose: () => void; onDone: () => void;
}) {
  const { currentUser } = useAuth();
  const [values, setValues] = useState({
    procedure: target.label ?? "", start: "", durationMinutes: "", room: "", surgeon: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : "", side: "", anesthesia: "", notes: "",
  });
  const set = (key: keyof typeof values, value: string) => setValues({ ...values, [key]: value });
  const startMs = values.start ? new Date(values.start).getTime() : NaN;
  const endMs = startMs + (Number(values.durationMinutes) || 0) * 60_000;
  // Overlap of the times announced by the surgeons in the same room: a conflict to check, not a prediction.
  const conflicts = Number.isFinite(startMs) && values.room ? scheduled.filter((episode) => {
    const plan = scheduleOf(episode);
    return plan && plan.room === values.room && plan.startMs < endMs && startMs < plan.endMs;
  }) : [];
  const ready = values.procedure.trim().length >= 2 && Number.isFinite(startMs) && Number(values.durationMinutes) > 0 && target.patientId;
  const submit = async () => {
    try {
      const episode = await openEpisode({ careUnitId: unitId, patientId: target.patientId!, sourceRequestId: target.requestId, priority: target.priority, reason: values.procedure.trim(), stage: "SCHEDULED", start: true });
      await recordCareEvent({
        careUnitId: unitId, episodeId: episode.id, type: "SURGERY_SCHEDULED",
        summary: `Programmé : ${values.procedure.trim()} le ${new Date(startMs).toLocaleString("fr-FR")} (${values.durationMinutes} min annoncées)${values.room ? ` · ${values.room}` : ""}`,
        payload: { ...values, start: new Date(startMs).toISOString(), durationMinutes: Number(values.durationMinutes), conflictsAcknowledged: conflicts.length },
      }, "Programmation");
      onDone();
    } catch { /* reported globally */ }
  };
  return (
    <Dialog title="Programmer une intervention" onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2"><Field label="Intervention prévue"><input className={inputClass} value={values.procedure} onChange={(e) => set("procedure", e.target.value)} /></Field></div>
        <Field label="Côté / site"><input className={inputClass} value={values.side} onChange={(e) => set("side", e.target.value)} /></Field>
        <Field label="Début"><input type="datetime-local" className={inputClass} value={values.start} onChange={(e) => set("start", e.target.value)} /></Field>
        <Field label="Durée annoncée par le chirurgien (min)"><input type="number" min={5} className={inputClass} value={values.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} /></Field>
        <Field label="Salle">
          <select className={inputClass} value={values.room} onChange={(e) => set("room", e.target.value)}><option value="">À attribuer</option>{rooms.map((item) => <option key={item.id} value={item.code}>{item.code} · {item.label}</option>)}</select>
        </Field>
        <Field label="Chirurgien"><input className={inputClass} value={values.surgeon} onChange={(e) => set("surgeon", e.target.value)} /></Field>
        <Field label="Anesthésie envisagée"><input className={inputClass} value={values.anesthesia} onChange={(e) => set("anesthesia", e.target.value)} /></Field>
        <Field label="Remarques"><input className={inputClass} value={values.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
      {conflicts.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Chevauchement dans {values.room} avec : {conflicts.map((episode) => `${patientName(episode.patient)} (${timeLabel(scheduleOf(episode)!.start)}, ${scheduleOf(episode)!.durationMinutes} min)`).join(" ; ")}. Vérifiez avant de confirmer.
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Aulia Care ne prévoit pas de durée : il utilise celle annoncée par le chirurgien pour repérer les chevauchements.</p>
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button disabled={!ready} onClick={() => void submit()}>{conflicts.length ? "Programmer malgré le chevauchement" : "Programmer"}</Button></div>
    </Dialog>
  );
}

function ScheduleBoard({ episodes, rooms, onOpen }: { episodes: CareEpisode[]; rooms: CareResource[]; onOpen: (id: string) => void }) {
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const dayStart = new Date(`${day}T00:00:00`).getTime();
  const items = episodes.filter((episode) => { const plan = scheduleOf(episode); return plan && plan.startMs >= dayStart && plan.startMs < dayStart + 86_400_000; });
  const lanes = [...rooms.map((room) => room.code), "À attribuer"];
  return (
    <Card title="Programme opératoire" actions={<input type="date" className={`${inputClass} w-auto`} value={day} onChange={(e) => setDay(e.target.value)} />}>
      {!items.length ? <Empty>Rien de programmé ce jour.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lanes.map((lane) => {
            const laneItems = items.filter((episode) => (scheduleOf(episode)!.room || "À attribuer") === lane).sort((a, b) => scheduleOf(a)!.startMs - scheduleOf(b)!.startMs);
            if (!laneItems.length) return null;
            return (
              <div key={lane} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="mb-2 text-sm font-bold">{lane}</p>
                <ol className="space-y-2">{laneItems.map((episode, index) => {
                  const plan = scheduleOf(episode)!;
                  const overlap = index > 0 && scheduleOf(laneItems[index - 1])!.endMs > plan.startMs;
                  return (
                    <li key={episode.id}>
                      <button type="button" onClick={() => onOpen(episode.id)} className={`w-full rounded-lg border p-2 text-left text-xs ${overlap ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-slate-100 dark:border-slate-800"}`}>
                        <p className="font-semibold">{new Date(plan.startMs).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} – {new Date(plan.endMs).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {patientName(episode.patient)}</p>
                        <p>{plan.procedure}{plan.surgeon ? ` · ${plan.surgeon}` : ""}{overlap ? " · chevauchement" : ""}</p>
                      </button>
                    </li>
                  );
                })}</ol>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Every item is ticked by a named person at a given time: each tick is its own signed event. */
function ChecklistDialog({ episode, unitId, checklist, onClose }: { episode: CareEpisode; unitId: string; checklist: typeof DEFAULT_SURGICAL_CHECKLIST; onClose: () => void }) {
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const load = () => fetchEpisode(episode.id).then(setDetail).catch(() => undefined);
  useEffect(() => { void load(); }, [episode.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = new Map<string, CareEvent>();
  for (const event of detail?.events ?? []) {
    if (event.type === "CHECKLIST_ITEM" && !(detail?.events ?? []).some((other) => other.correctsEventId === event.id)) ticks.set(`${event.payload?.phase}|${event.payload?.item}`, event);
  }
  const tick = async (phase: string, item: string, answer: string) => {
    try { await recordCareEvent({ careUnitId: unitId, episodeId: episode.id, type: "CHECKLIST_ITEM", summary: `${item} : ${answer}`, payload: { phase, item, answer } }, "Check-list"); await load(); } catch { /* reported globally */ }
  };
  return (
    <Dialog title={`Check-list de sécurité — ${patientName(episode.patient)}`} onClose={onClose} wide>
      {!detail ? <p className="text-sm text-slate-500">Chargement…</p> : checklist.map((phase) => {
        const done = phase.items.filter((item) => ticks.has(`${phase.phase}|${item}`)).length;
        return (
          <div key={phase.phase} className="mb-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="mb-2 text-sm font-bold">{phase.label} <Badge tone={done === phase.items.length ? "green" : "amber"}>{done}/{phase.items.length}</Badge></p>
            <ul className="space-y-1 text-sm">{phase.items.map((item) => {
              const event = ticks.get(`${phase.phase}|${item}`);
              return (
                <li key={item} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{item}</span>
                  {event ? <span className="text-xs text-slate-500"><Badge tone={event.payload?.answer === "Oui" || event.payload?.answer === "Fait" ? "green" : "amber"}>{String(event.payload?.answer)}</Badge> {personName(event.author)} · {timeLabel(event.occurredAt)}</span> : (
                    <span className="flex gap-1"><Button small onClick={() => void tick(phase.phase, item, "Fait")}>Fait</Button><Button small tone="ghost" onClick={() => void tick(phase.phase, item, "Non applicable")}>N/A</Button><Button small tone="danger" onClick={() => { const why = window.prompt("Problème constaté :"); if (why && why.trim()) void tick(phase.phase, item, `Problème : ${why.trim()}`); }}>Problème</Button></span>
                  )}
                </li>
              );
            })}</ul>
          </div>
        );
      })}
      <p className="text-xs text-slate-500">Chaque réponse est signée et horodatée ; une erreur se déclare depuis le dossier, sans effacer.</p>
    </Dialog>
  );
}

function CloseCaseButton({ episode, onDone }: { episode: CareEpisode; onDone: () => void }) {
  const close = async () => {
    const outcome = window.prompt("Issue : HOME (sortie), TRANSFER_INTERNAL (autre unité), DECEASED…", "HOME");
    if (!outcome) return;
    try { const fresh = await fetchEpisode(episode.id); await changeEpisodeStatus(episode.id, { version: fresh.version, status: "COMPLETED", outcome: outcome.trim().toUpperCase() }); onDone(); } catch { /* reported globally */ }
  };
  return <Button small tone="danger" onClick={() => void close()}>Clôturer</Button>;
}

function SurgeryReports({ unitId }: { unitId: string }) {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<CareEpisode[]>([]);
  useEffect(() => { void fetchUnitHistory(unitId, days).then(setRows).catch(() => setRows([])); }, [unitId, days]);
  const byOutcome = rows.reduce<Record<string, number>>((acc, row) => { const key = row.outcome ?? row.status; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  return (
    <Card title="Activité clôturée" actions={<select className={`${inputClass} w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option></select>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Interventions clôturées" value={rows.length} />
        {Object.entries(byOutcome).map(([key, count]) => <Stat key={key} label={key} value={count} />)}
      </div>
      <ul className="mt-4 space-y-1 text-sm">{rows.map((row) => <li key={row.id}>{timeLabel(row.endedAt)} · {patientName(row.patient)} · {row.reason ?? ""} · {row.outcome ?? row.status}</li>)}</ul>
    </Card>
  );
}
