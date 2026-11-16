import { useMemo, useState } from "react";
import {
  ageLabel, durationLabel, genderLabel, minutesSince, patientName, personName, PRIORITY_RANK, recordCareEvent, registerArrival, timeLabel,
  updateEpisode, type CareEpisode, type PatientSummary, type TriageLevel, type Worklist,
} from "../../../api/careWorkflow";
import { isQueued } from "../../../offline/offlineQueue";
import { useAuth } from "../../../context/AuthContext";
import { canWrite, HistoryList, IncomingTransfers, PatientSearch, requestStage, TaskList, TransferDialog } from "../shared";
import { Badge, Button, Card, Dialog, Empty, Field, inputClass, PriorityBadge, Stat } from "../ui";
import { ARRIVAL_MODES, EMERGENCY_STAGES as S, STAGE_LABELS, triageScale, triageValidated, waitingStatus } from "./emergencySettings";

export const EMERGENCY_TABS = [
  { id: "overview", label: "Vue d’ensemble" }, { id: "reception", label: "Accueil" }, { id: "triage", label: "Triage" },
  { id: "waiting", label: "Salle d’attente" }, { id: "active", label: "Patients en cours" }, { id: "boxes", label: "Box & lits" },
  { id: "requests", label: "Examens & demandes" }, { id: "care", label: "Soins & traitements" }, { id: "observations", label: "Observations" },
  { id: "orientation", label: "Orientation" }, { id: "history", label: "Historique" },
] as const;
export type EmergencyTab = (typeof EMERGENCY_TABS)[number]["id"];

type Props = { worklist: Worklist; tab: EmergencyTab; reload: () => void; openDossier: (episodeId: string) => void; setTab: (tab: EmergencyTab) => void };

const levelOf = (episode: CareEpisode, scale: TriageLevel[]) => {
  const code = episode.events?.find((event) => event.type === "TRIAGE")?.payload?.level;
  return scale.find((level) => level.code === String(code ?? ""));
};
const byUrgency = (scale: TriageLevel[]) => (a: CareEpisode, b: CareEpisode) => {
  const la = levelOf(a, scale); const lb = levelOf(b, scale);
  const ra = la ? scale.indexOf(la) : 99; const rb = lb ? scale.indexOf(lb) : 99;
  if (ra !== rb) return ra - rb;
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  return new Date(a.startedAt ?? a.createdAt).getTime() - new Date(b.startedAt ?? b.createdAt).getTime();
};

export function UrgencesModule({ worklist, tab, reload, openDossier, setTab }: Props) {
  const { unit, unitRole, episodes } = worklist;
  const writable = canWrite(unitRole);
  const scale = triageScale(unit.settings);
  const sorted = useMemo(() => [...episodes].sort(byUrgency(scale)), [episodes, scale]);
  const inStage = (stage: string) => sorted.filter((episode) => (episode.stage ?? S.ARRIVAL) === stage);
  const toTriage = inStage(S.ARRIVAL);
  const waiting = inStage(S.WAITING);
  const inCare = inStage(S.IN_CARE);
  const disposition = inStage(S.DISPOSITION);
  const overdue = waiting.filter((episode) => waitingStatus(episode, levelOf(episode, scale)).overdue);
  const [triageTarget, setTriageTarget] = useState<CareEpisode | null>(null);
  const [transferTarget, setTransferTarget] = useState<CareEpisode | null>(null);
  const { currentUser } = useAuth();

  const move = async (episode: CareEpisode, patch: { stage?: string; locationLabel?: string; responsibleUserId?: string }) => {
    try { await updateEpisode(episode.id, { version: episode.version, ...patch }); reload(); } catch { /* reported globally */ }
  };
  const takeCharge = (episode: CareEpisode) => move(episode, {
    stage: S.IN_CARE, ...(currentUser?.id && !episode.responsibleUserId ? { responsibleUserId: currentUser.id } : {}),
  });

  const row = (episode: CareEpisode, actions?: React.ReactNode) => {
    const level = levelOf(episode, scale);
    const wait = waitingStatus(episode, level);
    return (
      <li key={episode.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${wait.overdue && episode.stage === S.WAITING ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : "border-slate-200 dark:border-slate-800"}`}>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openDossier(episode.id)}>
          <p className="font-semibold text-slate-900 dark:text-white">
            {level ? <span className="mr-2 inline-block rounded px-1.5 text-xs font-bold text-white" style={{ background: level.color ?? "#475569" }}>{level.code}</span> : <Badge tone="amber">non trié</Badge>}{" "}
            {patientName(episode.patient)} <span className="text-xs font-normal text-slate-500">{[genderLabel(episode.patient.gender), ageLabel(episode.patient)].filter(Boolean).join(" · ")}</span>
          </p>
          <p className="text-xs text-slate-500">
            {episode.reason || "Motif non renseigné"} · arrivé {timeLabel(episode.startedAt ?? episode.createdAt)} · attente {durationLabel(wait.waited)}
            {wait.limit !== undefined && episode.stage === S.WAITING ? ` / délai cible ${durationLabel(wait.limit)}` : ""}
            {episode.locationLabel ? ` · ${episode.locationLabel}` : ""}{episode.responsible ? ` · ${personName(episode.responsible)}` : ""}
          </p>
        </button>
        <div className="flex flex-wrap items-center gap-1"><PriorityBadge priority={episode.priority} />{writable && actions}</div>
      </li>
    );
  };
  const list = (items: CareEpisode[], empty: string, actions?: (episode: CareEpisode) => React.ReactNode) =>
    items.length ? <ul className="space-y-2">{items.map((episode) => row(episode, actions?.(episode)))}</ul> : <Empty>{empty}</Empty>;

  const scaleWarning = !triageValidated(unit.settings) && (
    <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      Échelle de tri par défaut, non validée par l’établissement. Faites-la remplacer par votre protocole officiel (Administration › Unités de soins) avant usage réel.
    </p>
  );

  let content: React.ReactNode = null;
  switch (tab) {
    case "overview":
      content = (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Présents" value={episodes.length} />
            <Stat label="À trier" value={toTriage.length} tone={toTriage.length ? "amber" : undefined} />
            <Stat label="En attente" value={waiting.length} />
            <Stat label="Délai dépassé" value={overdue.length} tone={overdue.length ? "red" : undefined} />
            <Stat label="En soins" value={inCare.length} />
            <Stat label="Arrivées annoncées" value={worklist.incomingTransfers.length} tone={worklist.incomingTransfers.length ? "amber" : undefined} />
          </div>
          {overdue.length > 0 && <Card title="Attente au-delà du délai cible">{list(overdue, "", (episode) => <Button small onClick={() => void takeCharge(episode)}>Prendre en charge</Button>)}</Card>}
          {toTriage.length > 0 && <Card title="Patients à trier" actions={<Button small tone="secondary" onClick={() => setTab("triage")}>Aller au triage</Button>}>{list(toTriage, "")}</Card>}
          {worklist.incomingTransfers.length > 0 && <Card title="Arrivées annoncées (pré-admissions)"><IncomingTransfers transfers={worklist.incomingTransfers} role={unitRole} onChanged={reload} onOpenEpisode={openDossier} /></Card>}
        </div>
      );
      break;
    case "reception":
      content = (
        <div className="grid gap-4 xl:grid-cols-2">
          <ArrivalForm unitId={unit.id} disabled={!writable} onDone={(episode) => { reload(); setTab("triage"); setTriageTarget(episode); }} />
          <div className="space-y-4">
            <Card title="Arrivées annoncées"><IncomingTransfers transfers={worklist.incomingTransfers} role={unitRole} onChanged={reload} onOpenEpisode={openDossier} /></Card>
            <Card title={`Enregistrés, en attente de tri (${toTriage.length})`}>{list(toTriage, "Aucun patient en attente de tri.")}</Card>
          </div>
        </div>
      );
      break;
    case "triage":
      content = (
        <>
          {scaleWarning}
          <Card title={`À trier (${toTriage.length})`}>{list(toTriage, "Aucun patient à trier.", (episode) => <Button small onClick={() => setTriageTarget(episode)}>Trier</Button>)}</Card>
          <Card title="Re-tri (patients en attente)" className="mt-4">{list(waiting, "Personne en salle d’attente.", (episode) => <Button small tone="secondary" onClick={() => setTriageTarget(episode)}>Re-trier</Button>)}</Card>
        </>
      );
      break;
    case "waiting":
      content = <Card title={`Salle d’attente (${waiting.length}) — par niveau de tri puis heure d’arrivée`}>{list(waiting, "Personne en salle d’attente.", (episode) => (
        <><Button small tone="secondary" onClick={() => setTriageTarget(episode)}>Re-trier</Button><Button small onClick={() => void takeCharge(episode)}>Prendre en charge</Button></>
      ))}</Card>;
      break;
    case "active":
      content = <Card title={`Patients en cours de soins (${inCare.length + disposition.length})`}>{list([...inCare, ...disposition], "Aucun patient en soins.", (episode) => (
        <Button small tone="secondary" onClick={() => openDossier(episode.id)}>Dossier</Button>
      ))}</Card>;
      break;
    case "boxes":
      content = <BoxesBoard episodes={sorted} locations={unit.settings?.locations ?? []} writable={writable} onAssign={(episode, location) => void move(episode, { locationLabel: location })} openDossier={openDossier} />;
      break;
    case "requests":
      content = (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={`Demandes envoyées (${worklist.outgoingRequests.length})`}>
            {!worklist.outgoingRequests.length ? <Empty>Aucune demande en cours. Créez-les depuis le dossier du patient.</Empty> : (
              <ul className="space-y-2 text-sm">
                {worklist.outgoingRequests.map((request) => {
                  const stage = requestStage(request, new Set());
                  return (
                    <li key={request.id} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{request.label}</span><Badge tone={stage.tone}>{stage.label}</Badge></div>
                      <p className="text-xs text-slate-500">{patientName(request.patient)} · {request.performerUnit?.name} · {timeLabel(request.authoredAt)} · {durationLabel(minutesSince(request.authoredAt))}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title={`Demandes reçues par les urgences (${worklist.incomingRequests.length})`}>
            {!worklist.incomingRequests.length ? <Empty>Aucune demande reçue.</Empty> : (
              <ul className="space-y-2 text-sm">{worklist.incomingRequests.map((request) => <li key={request.id}><strong>{request.label}</strong> · {patientName(request.patient)} · de {request.requesterUnit?.name ?? "—"}</li>)}</ul>
            )}
            <div className="mt-4"><h4 className="mb-2 text-sm font-bold">Tâches de l’unité</h4><TaskList tasks={worklist.tasks} role={unitRole} onChanged={reload} /></div>
          </Card>
        </div>
      );
      break;
    case "care":
      content = <QuickDocumentation unitId={unit.id} episodes={[...inCare, ...disposition, ...waiting]} writable={writable} reload={reload}
        types={[{ code: "CARE_GIVEN", label: "Soin réalisé" }, { code: "MEDICATION_GIVEN", label: "Traitement administré" }]} title="Soins et traitements réalisés" />;
      break;
    case "observations":
      content = <QuickDocumentation unitId={unit.id} episodes={[...inCare, ...disposition, ...waiting, ...toTriage]} writable={writable} reload={reload} withVitals
        types={[{ code: "VITALS", label: "Constantes" }, { code: "OBSERVATION", label: "Observation clinique" }]} title="Observations et surveillance" />;
      break;
    case "orientation":
      content = (
        <div className="space-y-4">
          <Card title={`Orientation décidée (${disposition.length})`}>{list(disposition, "Aucune orientation en attente d’exécution.", (episode) => (
            <><Button small tone="secondary" onClick={() => setTransferTarget(episode)}>Transmettre</Button><Button small onClick={() => openDossier(episode.id)}>Clôturer…</Button></>
          ))}</Card>
          <Card title={`En soins, orientation à décider (${inCare.length})`}>{list(inCare, "Aucun patient.", (episode) => <OrientationButton episode={episode} unitId={unit.id} onDone={reload} />)}</Card>
        </div>
      );
      break;
    case "history":
      content = <HistoryList unitId={unit.id} onOpen={openDossier} />;
      break;
  }

  return (
    <>
      {content}
      {triageTarget && <TriageDialog episode={triageTarget} unitId={unit.id} scale={scale} validated={triageValidated(unit.settings)} onClose={() => setTriageTarget(null)} onDone={() => { setTriageTarget(null); reload(); }} />}
      {transferTarget && <TransferDialog episode={transferTarget} unit={unit} onClose={() => setTransferTarget(null)} onDone={() => { setTransferTarget(null); reload(); }} />}
    </>
  );
}

// ------------------------------------------------------------------ reception
function ArrivalForm({ unitId, disabled, onDone }: { unitId: string; disabled: boolean; onDone: (episode: CareEpisode) => void }) {
  const [mode, setMode] = useState<"known" | "unknown">("known");
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [provisional, setProvisional] = useState({ gender: "UNKNOWN", estimatedAgeYears: "", description: "" });
  const [form, setForm] = useState({ reason: "", arrivalMode: "OWN_MEANS" });
  const [saving, setSaving] = useState(false);
  const ready = !disabled && form.reason.trim().length >= 2 && (mode === "known" ? Boolean(patient) : true);
  const submit = async () => {
    setSaving(true);
    try {
      const episode = await registerArrival(unitId, {
        ...(mode === "known" && patient ? { patientId: patient.id } : {
          provisional: {
            gender: provisional.gender,
            ...(provisional.estimatedAgeYears !== "" ? { estimatedAgeYears: Math.max(0, Number(provisional.estimatedAgeYears)) } : {}),
            ...(provisional.description.trim() ? { description: provisional.description.trim() } : {}),
          },
        }),
        reason: form.reason.trim(), arrivalMode: form.arrivalMode,
      });
      setPatient(null); setForm({ reason: "", arrivalMode: "OWN_MEANS" }); setProvisional({ gender: "UNKNOWN", estimatedAgeYears: "", description: "" });
      onDone(episode);
    } catch { /* reported globally */ } finally { setSaving(false); }
  };
  return (
    <Card title="Enregistrer une arrivée">
      <div className="mb-3 flex gap-2">
        <Button small tone={mode === "known" ? "primary" : "secondary"} onClick={() => setMode("known")}>Patient identifiable</Button>
        <Button small tone={mode === "unknown" ? "primary" : "secondary"} onClick={() => setMode("unknown")}>Identité inconnue</Button>
      </div>
      {mode === "known" ? (
        patient ? (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-aulia-mist p-3 text-sm dark:bg-aulia-teal/10">
            <span><strong>{patientName(patient)}</strong> · {[genderLabel(patient.gender), ageLabel(patient), patient.externalId].filter(Boolean).join(" · ")}</span>
            <Button small tone="ghost" onClick={() => setPatient(null)}>Changer</Button>
          </div>
        ) : (
          <div className="mb-3"><Field label="Rechercher le dossier existant" hint="Un patient déjà connu n’a jamais de second dossier. S’il n’existe pas, l’accueil central le crée, ou utilisez « Identité inconnue » en urgence."><PatientSearch onPick={setPatient} /></Field></div>
        )
      ) : (
        <div className="mb-3 grid gap-3 md:grid-cols-3">
          <Field label="Sexe apparent">
            <select className={inputClass} value={provisional.gender} onChange={(e) => setProvisional({ ...provisional, gender: e.target.value })}>
              <option value="UNKNOWN">Indéterminé</option><option value="MALE">Masculin</option><option value="FEMALE">Féminin</option><option value="OTHER">Autre</option>
            </select>
          </Field>
          <Field label="Âge estimé (ans)"><input className={inputClass} type="number" min={0} max={120} value={provisional.estimatedAgeYears} onChange={(e) => setProvisional({ ...provisional, estimatedAgeYears: e.target.value })} /></Field>
          <Field label="Signes distinctifs"><input className={inputClass} value={provisional.description} onChange={(e) => setProvisional({ ...provisional, description: e.target.value })} placeholder="Vêtements, lieu de prise en charge…" /></Field>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Mode d’arrivée">
          <select className={inputClass} value={form.arrivalMode} onChange={(e) => setForm({ ...form, arrivalMode: e.target.value })}>
            {ARRIVAL_MODES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Motif de venue"><input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Tel que rapporté par le patient ou l’accompagnant" /></Field>
      </div>
      <div className="mt-4 flex justify-end"><Button disabled={!ready || saving} onClick={() => void submit()}>{saving ? "Enregistrement…" : "Enregistrer l’arrivée"}</Button></div>
    </Card>
  );
}

// ------------------------------------------------------------------ triage
const VITALS = [
  { key: "bloodPressure", label: "TA (mmHg)", placeholder: "120/80" }, { key: "heartRate", label: "FC (/min)" }, { key: "respiratoryRate", label: "FR (/min)" },
  { key: "spo2", label: "SpO₂ (%)" }, { key: "temperature", label: "T° (°C)" }, { key: "pain", label: "Douleur (0-10)" },
  { key: "glucose", label: "Glycémie" }, { key: "glasgow", label: "Glasgow (3-15)" },
] as const;
type VitalsForm = Record<(typeof VITALS)[number]["key"], string>;
const emptyVitals = (): VitalsForm => Object.fromEntries(VITALS.map((item) => [item.key, ""])) as VitalsForm;
const filledVitals = (vitals: VitalsForm) => Object.fromEntries(Object.entries(vitals).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
const vitalsText = (vitals: Record<string, string>) => VITALS.filter((item) => vitals[item.key]).map((item) => `${item.label.split(" ")[0]} ${vitals[item.key]}`).join(", ");

function VitalsFields({ value, onChange }: { value: VitalsForm; onChange: (value: VitalsForm) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {VITALS.map((item) => (
        <Field key={item.key} label={item.label}>
          <input className={inputClass} value={value[item.key]} placeholder={"placeholder" in item ? item.placeholder : undefined} onChange={(e) => onChange({ ...value, [item.key]: e.target.value })} />
        </Field>
      ))}
    </div>
  );
}

function TriageDialog({ episode, unitId, scale, validated, onClose, onDone }: { episode: CareEpisode; unitId: string; scale: TriageLevel[]; validated: boolean; onClose: () => void; onDone: () => void }) {
  const [level, setLevel] = useState<TriageLevel | null>(null);
  const [complaint, setComplaint] = useState(episode.reason ?? "");
  const [vitals, setVitals] = useState<VitalsForm>(emptyVitals());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!level) return;
    setSaving(true);
    try {
      const measured = filledVitals(vitals);
      await recordCareEvent({
        careUnitId: unitId, episodeId: episode.id, type: "TRIAGE",
        summary: [`Tri : ${level.label}`, complaint.trim() && `motif : ${complaint.trim()}`, Object.keys(measured).length && vitalsText(measured), notes.trim()].filter(Boolean).join(" — "),
        payload: { level: level.code, levelLabel: level.label, scaleValidated: validated, complaint: complaint.trim(), vitals: measured, notes: notes.trim() },
        episodeUpdate: { version: episode.version, stage: S.WAITING, ...(level.priority ? { priority: level.priority } : {}) },
      }, "Tri");
      onDone();
    } catch { /* reported globally */ } finally { setSaving(false); }
  };
  return (
    <Dialog title={`Triage — ${patientName(episode.patient)}`} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Motif de recours principal"><input className={inputClass} value={complaint} onChange={(e) => setComplaint(e.target.value)} /></Field>
        <VitalsFields value={vitals} onChange={setVitals} />
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Niveau de tri retenu par vous (protocole de l’établissement)</p>
          <div className="grid gap-2 sm:grid-cols-5">
            {scale.map((item) => (
              <button key={item.code} type="button" onClick={() => setLevel(item)}
                className={`rounded-xl border-2 p-3 text-left text-sm font-semibold ${level?.code === item.code ? "ring-2 ring-offset-2" : ""}`}
                style={{ borderColor: item.color ?? "#475569", color: item.color ?? undefined }}>
                {item.label}{item.maxWaitMinutes !== undefined && <span className="block text-xs font-normal text-slate-500">délai cible {durationLabel(item.maxWaitMinutes)}</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Aulia Care ne calcule pas le niveau : il enregistre votre décision, ses éléments et son auteur.</p>
        </div>
        <Field label="Remarques de l’infirmier d’accueil et d’orientation"><textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button disabled={!level || saving} onClick={() => void submit()}>Valider le tri → salle d’attente</Button></div>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ boxes
function BoxesBoard({ episodes, locations, writable, onAssign, openDossier }: { episodes: CareEpisode[]; locations: string[]; writable: boolean; onAssign: (episode: CareEpisode, location: string) => void; openDossier: (id: string) => void }) {
  const unplaced = episodes.filter((episode) => !episode.locationLabel && episode.stage !== S.ARRIVAL);
  if (!locations.length) return <Empty>Aucun box ni lit configuré pour cette unité (Administration › Unités de soins).</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {locations.map((location) => {
        const occupants = episodes.filter((episode) => episode.locationLabel === location);
        return (
          <div key={location} className={`rounded-2xl border p-3 ${occupants.length ? "border-aulia-teal/40 bg-aulia-mist/40 dark:bg-aulia-teal/5" : "border-dashed border-slate-300 dark:border-slate-700"}`}>
            <p className="text-sm font-bold">{location} {occupants.length > 1 && <Badge tone="red">{occupants.length} patients</Badge>}</p>
            {occupants.map((episode) => (
              <div key={episode.id} className="mt-2 text-sm">
                <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => openDossier(episode.id)}>{patientName(episode.patient)}</button>
                <div className="mt-1 flex items-center gap-2"><PriorityBadge priority={episode.priority} />{writable && <Button small tone="ghost" onClick={() => onAssign(episode, "")}>Libérer</Button>}</div>
              </div>
            ))}
            {!occupants.length && writable && unplaced.length > 0 && (
              <select className={`${inputClass} mt-2`} value="" onChange={(e) => { const episode = unplaced.find((item) => item.id === e.target.value); if (episode) onAssign(episode, location); }}>
                <option value="">Installer un patient…</option>
                {unplaced.map((episode) => <option key={episode.id} value={episode.id}>{patientName(episode.patient)}</option>)}
              </select>
            )}
            {!occupants.length && <p className="mt-2 text-xs text-slate-500">Libre</p>}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ quick documentation
function QuickDocumentation({ unitId, episodes, writable, reload, types, title, withVitals }: {
  unitId: string; episodes: CareEpisode[]; writable: boolean; reload: () => void; types: Array<{ code: string; label: string }>; title: string; withVitals?: boolean;
}) {
  const [episodeId, setEpisodeId] = useState("");
  const [type, setType] = useState(types[0].code);
  const [text, setText] = useState("");
  const [vitals, setVitals] = useState<VitalsForm>(emptyVitals());
  const [notice, setNotice] = useState<string | null>(null);
  const episode = episodes.find((item) => item.id === episodeId);
  const measured = filledVitals(vitals);
  const ready = writable && episode && (text.trim().length >= 2 || (type === "VITALS" && Object.keys(measured).length));
  const submit = async () => {
    if (!episode) return;
    try {
      const summary = type === "VITALS" ? [vitalsText(measured), text.trim()].filter(Boolean).join(" — ") : text.trim();
      const saved = await recordCareEvent({
        careUnitId: unitId, episodeId: episode.id, type, summary,
        payload: type === "VITALS" ? { vitals: measured, note: text.trim() } : undefined,
      }, `${types.find((item) => item.code === type)?.label} · ${patientName(episode.patient)}`);
      setText(""); setVitals(emptyVitals());
      setNotice(isQueued(saved) ? "Hors ligne : gardé sur cet appareil avec l’heure de saisie, envoi automatique au retour du réseau." : "Enregistré dans le dossier.");
      reload();
    } catch { /* reported globally */ }
  };
  return (
    <Card title={title}>
      {!episodes.length ? <Empty>Aucun patient présent.</Empty> : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Patient">
              <select className={inputClass} value={episodeId} onChange={(e) => setEpisodeId(e.target.value)}>
                <option value="">Choisir…</option>
                {episodes.map((item) => <option key={item.id} value={item.id}>{patientName(item.patient)}{item.locationLabel ? ` · ${item.locationLabel}` : ""} · {STAGE_LABELS[item.stage ?? ""] ?? item.stage}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
                {types.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </Field>
          </div>
          {withVitals && type === "VITALS" && <VitalsFields value={vitals} onChange={setVitals} />}
          <Field label={type === "MEDICATION_GIVEN" ? "Médicament, dose, voie (tel que prescrit)" : type === "VITALS" ? "Commentaire" : "Description"}>
            <textarea className={inputClass} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {notice && <p className="text-sm text-aulia-navy dark:text-aulia-mist">{notice}</p>}
          <div className="flex justify-end"><Button disabled={!ready} onClick={() => void submit()}>Enregistrer</Button></div>
          <p className="text-xs text-slate-500">Saisie horodatée et signée. Elle reste possible hors ligne et ne s’efface jamais : une erreur se déclare depuis le dossier.</p>
        </div>
      )}
    </Card>
  );
}

function OrientationButton({ episode, unitId, onDone }: { episode: CareEpisode; unitId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState("");
  const [destination, setDestination] = useState("HOME");
  const submit = async () => {
    try {
      await recordCareEvent({
        careUnitId: unitId, episodeId: episode.id, type: "ORIENTATION", summary: decision.trim(), payload: { outcome: destination },
        episodeUpdate: { version: episode.version, stage: S.DISPOSITION },
      }, "Orientation");
      setOpen(false); onDone();
    } catch { /* reported globally */ }
  };
  return (
    <>
      <Button small onClick={() => setOpen(true)}>Décider l’orientation</Button>
      {open && (
        <Dialog title={`Orientation — ${patientName(episode.patient)}`} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <Field label="Destination">
              <select className={inputClass} value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="HOME">Retour à domicile</option><option value="HOSPITALIZATION">Hospitalisation</option><option value="TRANSFER_INTERNAL">Autre unité (chirurgie, maternité…)</option>
                <option value="TRANSFER_EXTERNAL">Autre établissement</option><option value="OBSERVATION">Surveillance prolongée aux urgences</option>
              </select>
            </Field>
            <Field label="Décision médicale et consignes"><textarea className={inputClass} rows={3} value={decision} onChange={(e) => setDecision(e.target.value)} /></Field>
            <div className="flex justify-end gap-2"><Button tone="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button disabled={decision.trim().length < 2} onClick={() => void submit()}>Enregistrer la décision</Button></div>
          </div>
        </Dialog>
      )}
    </>
  );
}
