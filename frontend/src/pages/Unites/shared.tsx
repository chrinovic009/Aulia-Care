import { useEffect, useMemo, useState } from "react";
import {
  acknowledgeTransfer, ageLabel, genderLabel, changeEpisodeStatus, changeRequestStatus, changeTaskStatus, correctCareEvent, createServiceRequest,
  decideTransfer, fetchClinicUnits, fetchEpisode, fetchUnitHistory, KIND_LABELS, mergeProvisionalPatient, patientName, personName,
  PRIORITY_LABELS, recordCareEvent, REQUEST_STATUS_LABELS, searchCarePatients, sendTransfer, TASK_STATUS_LABELS, timeLabel,
  type CareEpisode, type CarePriority, type CareTask, type CareTransfer, type CareUnit, type CareUnitRole, type EpisodeDetail,
  type PatientSummary, type ServiceRequest,
} from "../../api/careWorkflow";
import { isQueued } from "../../offline/offlineQueue";
import { Badge, Button, Card, Dialog, Empty, Field, inputClass, PriorityBadge } from "./ui";

export const canWrite = (role: CareUnitRole) => role === "MEMBER" || role === "LEAD";

/** Generic closing outcomes; a unit can define its own in settings.outcomes. */
export const DEFAULT_OUTCOMES = [
  { code: "HOME", label: "Retour à domicile" },
  { code: "HOSPITALIZATION", label: "Hospitalisation" },
  { code: "TRANSFER_INTERNAL", label: "Transfert vers une autre unité" },
  { code: "TRANSFER_EXTERNAL", label: "Transfert vers un autre établissement" },
  { code: "LEFT_AGAINST_ADVICE", label: "Sortie contre avis" },
  { code: "LEFT_WITHOUT_BEING_SEEN", label: "Parti sans être vu" },
  { code: "DECEASED", label: "Décès" },
];

// ------------------------------------------------------------------ patient search
export function PatientSearch({ onPick, placeholder = "Nom, prénom, téléphone ou n° de dossier" }: { onPick: (patient: PatientSummary) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchCarePatients(query.trim()).then(setResults).catch(() => setResults([])).finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  return (
    <div>
      <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoFocus />
      {loading && <p className="mt-2 text-xs text-slate-500">Recherche…</p>}
      {results.length > 0 && (
        <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {results.map((patient) => (
            <li key={patient.id}>
              <button type="button" onClick={() => onPick(patient)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-aulia-mist dark:hover:bg-aulia-teal/10">
                <span className="font-semibold text-slate-800 dark:text-white">{patientName(patient)}</span>
                <span className="text-xs text-slate-500">{[genderLabel(patient.gender), ageLabel(patient), patient.externalId, patient.phone].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && query.trim().length >= 2 && !results.length && <p className="mt-2 text-xs text-slate-500">Aucun dossier trouvé. Vérifiez l’orthographe avant de créer une identité provisoire.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ requests
/** Shared vocabulary of the request pipeline: À valider → Demandée → Acceptée → En cours → Résultat disponible → Consultée → Clôturée. */
export function requestStage(request: ServiceRequest, reviewedRequestIds: Set<string>) {
  if (request.status === "DRAFT") return { label: "À valider", tone: "amber" as const };
  if (request.status === "COMPLETED") return { label: "Clôturée", tone: "slate" as const };
  if (request.status === "REVOKED" || request.status === "ENTERED_IN_ERROR") return { label: REQUEST_STATUS_LABELS[request.status], tone: "slate" as const };
  if (reviewedRequestIds.has(request.id) || (request.events?.length ?? 0) > 0) return { label: "Consultée", tone: "green" as const };
  const task = request.tasks?.[0];
  if (task) {
    if (task.status === "READY" || task.status === "COMPLETED") return { label: "Résultat disponible", tone: "teal" as const };
    if (task.status === "IN_PROGRESS") return { label: "En cours", tone: "teal" as const };
    if (task.status === "ACCEPTED") return { label: "Acceptée", tone: "teal" as const };
    if (task.status === "REJECTED" || task.status === "FAILED") return { label: TASK_STATUS_LABELS[task.status], tone: "red" as const };
  }
  return { label: "Demandée", tone: "amber" as const };
}

export function RequestDialog({ episode, unit, onClose, onDone }: { episode: { id: string; patientId: string }; unit: CareUnit; onClose: () => void; onDone: () => void }) {
  const [units, setUnits] = useState<CareUnit[]>([]);
  const [form, setForm] = useState({ performerUnitId: "", category: "EXAMEN", code: "", label: "", reason: "", priority: "URGENT" as CarePriority, draft: false });
  useEffect(() => { void fetchClinicUnits().then((rows) => setUnits(rows.filter((item) => item.id !== unit.id))).catch(() => setUnits([])); }, [unit.id]);
  const ready = form.performerUnitId && form.label.trim().length >= 2 && form.code.trim();
  const submit = async () => {
    try {
      await createServiceRequest({
        patientId: episode.patientId, episodeId: episode.id, requesterUnitId: unit.id, performerUnitId: form.performerUnitId,
        category: form.category, code: form.code.trim(), label: form.label.trim(), reason: form.reason.trim() || undefined, priority: form.priority, draft: form.draft,
      });
      onDone();
    } catch { /* reported globally */ }
  };
  return (
    <Dialog title="Nouvelle demande vers une autre unité" onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Unité qui réalise">
          <select className={inputClass} value={form.performerUnitId} onChange={(e) => setForm({ ...form, performerUnitId: e.target.value })}>
            <option value="">Choisir…</option>
            {units.map((item) => <option key={item.id} value={item.id}>{item.name} · {KIND_LABELS[item.kind]}</option>)}
          </select>
        </Field>
        <Field label="Catégorie">
          <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="EXAMEN">Examen</option><option value="AVIS">Avis spécialisé</option><option value="INTERVENTION">Intervention</option>
            <option value="ADMISSION">Admission / lit</option><option value="TRANSPORT">Transport</option><option value="AUTRE">Autre</option>
          </select>
        </Field>
        <Field label="Code (catalogue de l’établissement)"><input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex. NFS, RX-THORAX" /></Field>
        <Field label="Intitulé"><input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
        <Field label="Priorité">
          <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as CarePriority })}>
            {(Object.keys(PRIORITY_LABELS) as CarePriority[]).map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
          </select>
        </Field>
        <Field label="Motif / question posée"><input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.draft} onChange={(e) => setForm({ ...form, draft: e.target.checked })} /> Enregistrer « à valider » par un médecin avant envoi</label>
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button disabled={!ready} onClick={() => void submit()}>Envoyer la demande</Button></div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ transfers
export function TransferDialog({ episode, unit, onClose, onDone, preset }: {
  episode: { id: string; patientId: string }; unit: CareUnit; onClose: () => void; onDone: () => void; preset?: { toKind?: string; reason?: string };
}) {
  const [units, setUnits] = useState<CareUnit[]>([]);
  const [form, setForm] = useState({ toUnitId: "", reason: preset?.reason ?? "", observations: "", careGiven: "", medications: "", keyInformation: "" });
  useEffect(() => {
    void fetchClinicUnits().then((rows) => {
      const others = rows.filter((item) => item.id !== unit.id);
      setUnits(others);
      const match = preset?.toKind && others.find((item) => item.kind === preset.toKind);
      if (match) setForm((value) => ({ ...value, toUnitId: match.id }));
    }).catch(() => setUnits([]));
  }, [unit.id, preset?.toKind]);
  const ready = form.toUnitId && form.reason.trim().length >= 2 && (form.observations.trim() || form.keyInformation.trim());
  const submit = async () => {
    try {
      await sendTransfer({
        patientId: episode.patientId, fromUnitId: unit.id, fromEpisodeId: episode.id, toUnitId: form.toUnitId, reason: form.reason.trim(),
        summary: { observations: form.observations.trim(), careGiven: form.careGiven.trim(), medications: form.medications.trim(), keyInformation: form.keyInformation.trim() },
      });
      onDone();
    } catch { /* reported globally */ }
  };
  return (
    <Dialog title="Transmission structurée vers une autre unité" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Unité destinataire">
          <select className={inputClass} value={form.toUnitId} onChange={(e) => setForm({ ...form, toUnitId: e.target.value })}>
            <option value="">Choisir…</option>
            {units.map((item) => <option key={item.id} value={item.id}>{item.name} · {KIND_LABELS[item.kind]}</option>)}
          </select>
        </Field>
        <Field label="Motif du transfert"><input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        <Field label="Situation et observations"><textarea className={inputClass} rows={3} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></Field>
        <Field label="Soins réalisés"><textarea className={inputClass} rows={2} value={form.careGiven} onChange={(e) => setForm({ ...form, careGiven: e.target.value })} /></Field>
        <Field label="Traitements administrés / en cours"><textarea className={inputClass} rows={2} value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} /></Field>
        <Field label="Points d’attention (allergies, risques, attentes de la famille…)"><textarea className={inputClass} rows={2} value={form.keyInformation} onChange={(e) => setForm({ ...form, keyInformation: e.target.value })} /></Field>
      </div>
      <p className="mt-2 text-xs text-slate-500">Le patient reste sous votre responsabilité tant que l’unité destinataire n’a pas accepté.</p>
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button disabled={!ready} onClick={() => void submit()}>Envoyer la transmission</Button></div>
    </Dialog>
  );
}

const SUMMARY_LABELS: Record<string, string> = { observations: "Observations", careGiven: "Soins réalisés", medications: "Traitements", keyInformation: "Points d’attention" };
export function TransferSummary({ summary }: { summary: Record<string, unknown> }) {
  const entries = Object.entries(summary ?? {}).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
  if (!entries.length) return null;
  return (
    <dl className="mt-2 grid gap-1 text-sm">
      {entries.map(([key, value]) => (
        <div key={key}><dt className="inline font-semibold">{SUMMARY_LABELS[key] ?? key} : </dt><dd className="inline whitespace-pre-wrap">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>
      ))}
    </dl>
  );
}

export function IncomingTransfers({ transfers, role, onChanged, onOpenEpisode }: { transfers: CareTransfer[]; role: CareUnitRole; onChanged: () => void; onOpenEpisode?: (episodeId: string) => void }) {
  const act = async (work: () => Promise<unknown>) => { try { await work(); onChanged(); } catch { /* reported globally */ } };
  if (!transfers.length) return <Empty>Aucune transmission entrante.</Empty>;
  return (
    <ul className="space-y-3">
      {transfers.map((transfer) => (
        <li key={transfer.id} className="rounded-xl border border-aulia-teal/30 bg-aulia-mist/40 p-3 dark:bg-aulia-teal/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{patientName(transfer.patient)} <span className="text-xs font-normal text-slate-500">· de {transfer.fromUnit?.name ?? "—"} · {timeLabel(transfer.sentAt)} · par {personName(transfer.sender)}</span></p>
            <Badge tone={transfer.status === "SENT" ? "amber" : "teal"}>{transfer.status === "SENT" ? "Non lue" : "Lue"}</Badge>
          </div>
          <p className="mt-1 text-sm"><strong>Motif :</strong> {transfer.reason}</p>
          <TransferSummary summary={transfer.summary} />
          {canWrite(role) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {transfer.status === "SENT" && <Button small tone="secondary" onClick={() => void act(() => acknowledgeTransfer(transfer.id, transfer.version))}>Accuser réception</Button>}
              <Button small onClick={() => void act(async () => {
                const decided = await decideTransfer(transfer.id, { version: transfer.version, decision: "ACCEPT" });
                if (decided.toEpisodeId) onOpenEpisode?.(decided.toEpisodeId);
              })}>Accepter le patient</Button>
              <Button small tone="danger" onClick={() => {
                const reason = window.prompt("Motif du refus (transmis à l’unité d’origine) :");
                if (reason && reason.trim().length >= 2) void act(() => decideTransfer(transfer.id, { version: transfer.version, decision: "REJECT", reason: reason.trim() }));
              }}>Refuser</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ tasks
export function TaskList({ tasks, role, onChanged }: { tasks: CareTask[]; role: CareUnitRole; onChanged: () => void }) {
  const move = async (task: CareTask, status: CareTask["status"], askReason?: boolean) => {
    const reason = askReason ? window.prompt("Motif (obligatoire) :") : undefined;
    if (askReason && (!reason || reason.trim().length < 2)) return;
    try { await changeTaskStatus(task.id, { version: task.version, status, reason: reason?.trim() }); onChanged(); } catch { /* reported globally */ }
  };
  if (!tasks.length) return <Empty>Aucune tâche en attente.</Empty>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div>
            <p className="font-semibold">{task.title} <PriorityBadge priority={task.priority} /></p>
            <p className="text-xs text-slate-500">{patientName(task.patient)} · {TASK_STATUS_LABELS[task.status]} · {task.owner ? `pris par ${personName(task.owner)}` : "non attribuée"}{task.dueAt ? ` · pour ${timeLabel(task.dueAt)}` : ""}</p>
          </div>
          {canWrite(role) && (
            <div className="flex flex-wrap gap-1">
              {["REQUESTED", "RECEIVED"].includes(task.status) && <Button small tone="secondary" onClick={() => void move(task, "ACCEPTED")}>Accepter</Button>}
              {["REQUESTED", "RECEIVED"].includes(task.status) && <Button small tone="ghost" onClick={() => void move(task, "REJECTED", true)}>Refuser</Button>}
              {["ACCEPTED", "READY"].includes(task.status) && <Button small tone="secondary" onClick={() => void move(task, "IN_PROGRESS")}>Démarrer</Button>}
              {task.status === "IN_PROGRESS" && <Button small onClick={() => void move(task, "COMPLETED")}>Terminer</Button>}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ history
export function HistoryList({ unitId, onOpen }: { unitId: string; onOpen: (episodeId: string) => void }) {
  const [days, setDays] = useState(1);
  const [rows, setRows] = useState<CareEpisode[]>([]);
  useEffect(() => { void fetchUnitHistory(unitId, days).then(setRows).catch(() => setRows([])); }, [unitId, days]);
  return (
    <Card title="Prises en charge clôturées" actions={
      <select className={`${inputClass} w-auto`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
        <option value={1}>24 dernières heures</option><option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option>
      </select>}>
      {!rows.length ? <Empty>Aucune prise en charge clôturée sur la période.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="p-2">Patient</th><th className="p-2">Arrivée</th><th className="p-2">Sortie</th><th className="p-2">Issue</th><th className="p-2">Responsable</th><th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2 font-semibold">{patientName(row.patient)}</td>
                  <td className="p-2">{timeLabel(row.startedAt ?? row.createdAt)}</td>
                  <td className="p-2">{timeLabel(row.endedAt)}</td>
                  <td className="p-2">{DEFAULT_OUTCOMES.find((item) => item.code === row.outcome)?.label ?? row.outcome ?? row.status}</td>
                  <td className="p-2">{personName(row.responsible)}</td>
                  <td className="p-2 text-right"><Button small tone="ghost" onClick={() => onOpen(row.id)}>Dossier</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ dossier of a stay
const EVENT_LABELS: Record<string, string> = {
  ARRIVAL: "Arrivée", TRIAGE: "Tri", OBSERVATION: "Observation", VITALS: "Constantes", CARE_GIVEN: "Soin réalisé", MEDICATION_GIVEN: "Traitement administré",
  ORIENTATION: "Orientation", RESULT_REVIEWED: "Résultat consulté", EPISODE_OPENED: "Ouverture", EPISODE_STATUS_CHANGED: "Statut", EPISODE_UPDATED: "Mise à jour",
  EPISODE_RESPONSIBLE_CHANGED: "Responsable", IDENTITY_MERGED: "Identité confirmée", ENTERED_IN_ERROR: "Saisi en erreur", REQUEST_CREATED: "Demande",
  TRANSFER_SENT: "Transmission envoyée", TRANSFER_ACCEPTED: "Transmission acceptée", TRANSFER_REJECTED: "Transmission refusée",
  TRANSFER_RECEIVED: "Transmission lue", TRANSFER_CANCELLED: "Transmission annulée", REQUEST_SENT: "Demande envoyée", REQUEST_DRAFTED: "Demande à valider",
  REQUEST_STATUS_CHANGED: "Demande mise à jour", TASK_STATUS_CHANGED: "Tâche mise à jour", TASK_ASSIGNED: "Tâche attribuée", VALIDATION: "Validation",
};
/** Only professional documentation can be declared erroneous; system traces cannot. */
const CORRECTABLE_EVENTS = new Set(["OBSERVATION", "VITALS", "CARE_GIVEN", "MEDICATION_GIVEN", "TRIAGE", "ORIENTATION", "RESULT_REVIEWED"]);
export const eventLabel = (type: string) => EVENT_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();

export function EpisodeDossier({ episodeId, unit, role, onClose, onChanged, extraActions, stageLabels }: {
  episodeId: string; unit: CareUnit; role: CareUnitRole; onClose: () => void; onChanged: () => void; stageLabels?: Record<string, string>;
  extraActions?: (detail: EpisodeDetail, reload: () => void) => React.ReactNode;
}) {
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("OBSERVATION");
  const [dialog, setDialog] = useState<null | "request" | "transfer" | "merge" | "close">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = () => fetchEpisode(episodeId).then(setDetail).catch(() => setNotice("Le dossier n’a pas pu être chargé."));
  useEffect(() => { void load(); }, [episodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = () => { void load(); onChanged(); };
  const writable = canWrite(role) && detail && ["PLANNED", "IN_PROGRESS", "ON_HOLD"].includes(detail.status);
  const reviewed = useMemo(() => new Set((detail?.events ?? []).filter((event) => event.type === "RESULT_REVIEWED").map((event) => String(event.requestId ?? ""))), [detail]);
  const corrected = useMemo(() => new Set((detail?.events ?? []).map((event) => event.correctsEventId).filter(Boolean)), [detail]);

  const addNote = async () => {
    if (!detail || note.trim().length < 2) return;
    try {
      const saved = await recordCareEvent({ careUnitId: unit.id, episodeId: detail.id, type: noteType, summary: note.trim() }, `${eventLabel(noteType)} · ${patientName(detail.patient)}`);
      setNote("");
      setNotice(isQueued(saved) ? "Hors ligne : la saisie est gardée sur cet appareil et sera envoyée au retour du réseau." : null);
      reload();
    } catch { /* reported globally */ }
  };
  const retract = async (eventId: string) => {
    const reason = window.prompt("Pourquoi cette saisie est-elle erronée ? (elle restera visible, barrée)");
    if (!reason || reason.trim().length < 2) return;
    try { await correctCareEvent(eventId, { reason: reason.trim(), retract: true }); reload(); } catch { /* reported globally */ }
  };
  const markReviewed = async (request: ServiceRequest) => {
    if (!detail) return;
    try { await recordCareEvent({ careUnitId: unit.id, episodeId: detail.id, requestId: request.id, type: "RESULT_REVIEWED", summary: `Résultat consulté : ${request.label}` }, "Résultat consulté"); reload(); } catch { /* reported globally */ }
  };
  const closeRequest = async (request: ServiceRequest) => {
    try { await changeRequestStatus(request.id, { version: request.version, status: "COMPLETED" }); reload(); } catch { /* reported globally */ }
  };
  const validateDraft = async (request: ServiceRequest) => {
    try { await changeRequestStatus(request.id, { version: request.version, status: "ACTIVE" }); reload(); } catch { /* reported globally */ }
  };

  return (
    <Dialog title={detail ? `${patientName(detail.patient)} — ${unit.name}` : "Dossier"} onClose={onClose} wide>
      {!detail ? <p className="text-sm text-slate-500">{notice ?? "Chargement…"}</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <PriorityBadge priority={detail.priority} />
            <Badge>{detail.status === "IN_PROGRESS" ? "En cours" : detail.status}</Badge>
            {detail.stage && <Badge tone="teal">{stageLabels?.[detail.stage] ?? detail.stage}</Badge>}
            {detail.locationLabel && <Badge tone="teal">{detail.locationLabel}</Badge>}
            <span className="text-slate-500">{[genderLabel(detail.patient.gender), ageLabel(detail.patient)].filter(Boolean).join(" · ")} · arrivé {timeLabel(detail.startedAt ?? detail.createdAt)} · responsable {personName(detail.responsible)}</span>
          </div>
          {detail.patient.identityStatus === "PROVISIONAL" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Identité provisoire. Dès que la personne est identifiée, rattachez ce dossier à son dossier définitif (aucun second dossier n’est créé).
              {writable && <span className="ml-2"><Button small tone="secondary" onClick={() => setDialog("merge")}>Identifier le patient</Button></span>}
            </div>
          )}
          {notice && <p className="rounded-lg bg-aulia-mist p-2 text-sm text-aulia-navy">{notice}</p>}
          {writable && (
            <div className="flex flex-wrap gap-2">
              {extraActions?.(detail, reload)}
              <Button small tone="secondary" onClick={() => setDialog("request")}>Demande / examen</Button>
              <Button small tone="secondary" onClick={() => setDialog("transfer")}>Transmettre à une unité</Button>
              <Button small tone="danger" onClick={() => setDialog("close")}>Clôturer la prise en charge</Button>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Card title="Chronologie">
              {writable && (
                <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <div className="flex gap-2">
                    <select className={`${inputClass} w-44`} value={noteType} onChange={(e) => setNoteType(e.target.value)}>
                      <option value="OBSERVATION">Observation</option><option value="CARE_GIVEN">Soin réalisé</option><option value="MEDICATION_GIVEN">Traitement administré</option><option value="VITALS">Constantes</option>
                    </select>
                    <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce qui a été constaté ou fait, à l’heure actuelle" onKeyDown={(e) => { if (e.key === "Enter") void addNote(); }} />
                  </div>
                  <Button disabled={note.trim().length < 2} onClick={() => void addNote()}>Ajouter</Button>
                </div>
              )}
              <ol className="max-h-[50vh] space-y-2 overflow-y-auto">
                {[...detail.events].reverse().map((event) => {
                  const struck = corrected.has(event.id);
                  return (
                    <li key={event.id} className={`rounded-lg border p-2 text-sm ${struck ? "border-slate-200 opacity-60" : "border-slate-100 dark:border-slate-800"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span><Badge tone={event.type === "TRIAGE" ? "red" : "slate"}>{eventLabel(event.type)}</Badge> <span className="text-xs text-slate-500">{timeLabel(event.occurredAt)} · {personName(event.author)}{event.occurredAt.slice(0, 16) !== event.recordedAt.slice(0, 16) ? ` · saisi ${timeLabel(event.recordedAt)}` : ""}</span></span>
                        {writable && !struck && !event.correctsEventId && CORRECTABLE_EVENTS.has(event.type) && (
                          <button type="button" className="text-xs text-slate-500 underline" onClick={() => void retract(event.id)}>Déclarer erronée</button>
                        )}
                      </div>
                      <p className={`mt-1 whitespace-pre-wrap ${struck ? "line-through" : ""}`}>{event.summary}</p>
                      {event.correctionReason && <p className="text-xs text-slate-500">Correction : {event.correctionReason}</p>}
                    </li>
                  );
                })}
              </ol>
            </Card>
            <div className="space-y-4">
              <Card title="Demandes & examens">
                {!detail.requests.length ? <Empty>Aucune demande.</Empty> : (
                  <ul className="space-y-2 text-sm">
                    {detail.requests.map((request) => {
                      const stage = requestStage(request, reviewed);
                      return (
                        <li key={request.id} className="rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold">{request.label}</span><Badge tone={stage.tone}>{stage.label}</Badge>
                          </div>
                          <p className="text-xs text-slate-500">{request.performerUnit?.name} · {PRIORITY_LABELS[request.priority]} · {timeLabel(request.authoredAt)}</p>
                          {writable && (
                            <div className="mt-1 flex gap-1">
                              {request.status === "DRAFT" && <Button small tone="secondary" onClick={() => void validateDraft(request)}>Valider et envoyer</Button>}
                              {stage.label === "Résultat disponible" && <Button small tone="secondary" onClick={() => void markReviewed(request)}>Marquer consulté</Button>}
                              {stage.label === "Consultée" && <Button small tone="ghost" onClick={() => void closeRequest(request)}>Clôturer</Button>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              {(detail.transfersOut.length > 0 || detail.transfersIn.length > 0) && (
                <Card title="Transmissions">
                  <ul className="space-y-2 text-sm">
                    {detail.transfersIn.map((transfer) => <li key={transfer.id}>Reçu de <strong>{transfer.fromUnit?.name}</strong> · {transfer.reason}<TransferSummary summary={transfer.summary} /></li>)}
                    {detail.transfersOut.map((transfer) => <li key={transfer.id}>Vers <strong>{transfer.toUnit?.name}</strong> · {transfer.status} · {transfer.reason}</li>)}
                  </ul>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
      {detail && dialog === "request" && <RequestDialog episode={detail} unit={unit} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} />}
      {detail && dialog === "transfer" && <TransferDialog episode={detail} unit={unit} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} />}
      {detail && dialog === "merge" && <MergeDialog patient={detail.patient} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} />}
      {detail && dialog === "close" && <CloseEpisodeDialog episode={detail} unit={unit} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged(); onClose(); }} />}
    </Dialog>
  );
}

function MergeDialog({ patient, onClose, onDone }: { patient: PatientSummary; onClose: () => void; onDone: () => void }) {
  const [target, setTarget] = useState<PatientSummary | null>(null);
  const [reason, setReason] = useState("");
  const submit = async () => {
    if (!target) return;
    try { await mergeProvisionalPatient(patient.id, target.id, reason.trim()); onDone(); } catch { /* reported globally */ }
  };
  return (
    <Dialog title="Identifier le patient" onClose={onClose}>
      {!target ? (
        <>
          <p className="mb-2 text-sm text-slate-600">Recherchez le dossier définitif. S’il n’existe pas encore, faites-le créer par l’accueil, puis revenez ici.</p>
          <PatientSearch onPick={(picked) => { if (picked.id !== patient.id && picked.identityStatus !== "PROVISIONAL") setTarget(picked); }} />
        </>
      ) : (
        <div className="space-y-3 text-sm">
          <p>Rattacher <strong>{patientName(patient)}</strong> au dossier de <strong>{patientName(target)}</strong> ({[genderLabel(target.gender), ageLabel(target), target.externalId].filter(Boolean).join(" · ")}).</p>
          <Field label="Comment l’identité a-t-elle été établie ? (obligatoire)"><textarea className={inputClass} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. pièce d’identité présentée par la famille" /></Field>
          <p className="text-xs text-slate-500">La prise en charge en cours et les demandes ouvertes passent au dossier définitif ; l’historique provisoire reste consultable dans sa chronologie.</p>
          <div className="flex justify-end gap-2"><Button tone="ghost" onClick={() => setTarget(null)}>Changer de dossier</Button><Button disabled={reason.trim().length < 10} onClick={() => void submit()}>Confirmer l’identité</Button></div>
        </div>
      )}
    </Dialog>
  );
}

export function CloseEpisodeDialog({ episode, unit, onClose, onDone }: { episode: EpisodeDetail; unit: CareUnit; onClose: () => void; onDone: () => void }) {
  const outcomes = unit.settings?.outcomes?.length ? unit.settings.outcomes : DEFAULT_OUTCOMES;
  const [outcome, setOutcome] = useState(outcomes[0].code);
  const [summary, setSummary] = useState("");
  const required = unit.settings?.closureRequirements ?? [];
  const hasOrientation = episode.events.some((event) => event.type === "ORIENTATION");
  const needsOrientation = required.some((item) => item.eventType === "ORIENTATION") && !hasOrientation;
  const submit = async () => {
    try {
      if (needsOrientation || summary.trim()) {
        await recordCareEvent({ careUnitId: unit.id, episodeId: episode.id, type: "ORIENTATION", summary: summary.trim() || outcomes.find((item) => item.code === outcome)?.label || outcome, payload: { outcome } }, "Orientation");
      }
      const fresh = await fetchEpisode(episode.id);
      await changeEpisodeStatus(episode.id, { version: fresh.version, status: "COMPLETED", outcome });
      onDone();
    } catch { /* reported globally (missing mandatory documentation is explained by the server) */ }
  };
  return (
    <Dialog title="Clôturer la prise en charge" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Issue">
          <select className={inputClass} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {outcomes.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </Field>
        <Field label={needsOrientation ? "Décision d’orientation (obligatoire)" : "Décision d’orientation / consignes de sortie"}>
          <textarea className={inputClass} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        {required.length > 0 && <p className="text-xs text-slate-500">Documentation exigée par l’unité avant clôture : {required.map((item) => item.label ?? item.eventType).join(", ")}.</p>}
        <p className="text-xs text-slate-500">Pour un transfert vers une autre unité, envoyez d’abord la transmission : la clôture se fait après son acceptation.</p>
        <div className="flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button tone="danger" disabled={needsOrientation && summary.trim().length < 2} onClick={() => void submit()}>Clôturer</Button></div>
      </div>
    </Dialog>
  );
}
