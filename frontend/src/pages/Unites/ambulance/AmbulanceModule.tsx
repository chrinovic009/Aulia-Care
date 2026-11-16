import { useEffect, useMemo, useState } from "react";
import {
  ageLabel, changeEpisodeStatus, durationLabel, fetchEpisode, fetchResources, genderLabel, minutesSince, openEpisode, patientName, PRIORITY_LABELS, PRIORITY_RANK,
  recordCareEvent, registerArrival, timeLabel, updateEpisode, updateResource,
  type CareEpisode, type CarePriority, type CareResource, type PatientSummary, type Worklist,
} from "../../../api/careWorkflow";
import { isQueued } from "../../../offline/offlineQueue";
import { ResourcesBoard } from "../ResourcesBoard";
import { canWrite, HistoryList, IncomingTransfers, PatientSearch, TransferDialog } from "../shared";
import { Badge, Button, Card, Dialog, Empty, Field, inputClass, PriorityBadge, Stat } from "../ui";

export const AMBULANCE_TABS = [
  { id: "overview", label: "Vue d’ensemble" }, { id: "calls", label: "Appels & demandes" }, { id: "dispatch", label: "Dispatch" },
  { id: "missions", label: "Interventions" }, { id: "patients", label: "Patients transportés" }, { id: "teams", label: "Équipes" },
  { id: "vehicles", label: "Véhicules" }, { id: "equipment", label: "Équipements" }, { id: "transfers", label: "Transmissions" },
  { id: "history", label: "Historique" },
] as const;
export type AmbulanceTab = (typeof AMBULANCE_TABS)[number]["id"];

/** Ten-step mission lifecycle (stage codes also declared in the unit settings). */
export const MISSION_STEPS = [
  { code: "CALL", label: "Appel reçu" }, { code: "QUALIFIED", label: "Appel qualifié" }, { code: "DISPATCHED", label: "Équipe engagée" },
  { code: "EN_ROUTE", label: "En route" }, { code: "ON_SCENE", label: "Sur place" }, { code: "PATIENT_CONTACT", label: "Patient pris en charge" },
  { code: "TRANSPORT", label: "Transport en cours" }, { code: "AT_DESTINATION", label: "Arrivé à destination" },
  { code: "HANDOVER", label: "Patient remis" }, { code: "AVAILABLE", label: "Équipe disponible (clôture)" },
] as const;
export const AMBULANCE_DEFAULT_SETTINGS = { stages: MISSION_STEPS.map((step) => step.code), stageEventType: "MISSION_STEP" };
const stepIndex = (stage?: string | null) => Math.max(0, MISSION_STEPS.findIndex((step) => step.code === stage));
const stepLabel = (stage?: string | null) => MISSION_STEPS[stepIndex(stage)].label;

/** The stage shown is the latest step documented, including steps queued offline but not yet replayed. */
function currentStage(episode: CareEpisode) {
  const steps = (episode.events ?? []).filter((event) => event.type === "MISSION_STEP");
  const latest = steps[0]?.payload?.stage;
  return typeof latest === "string" ? latest : episode.stage ?? "CALL";
}
const stepTime = (episode: CareEpisode, code: string) =>
  (episode.events ?? []).find((event) => event.type === "MISSION_STEP" && event.payload?.stage === code)?.occurredAt;

type Props = { worklist: Worklist; tab: AmbulanceTab; reload: () => void; openDossier: (episodeId: string) => void; setTab: (tab: AmbulanceTab) => void };

export function AmbulanceModule({ worklist, tab, reload, openDossier, setTab }: Props) {
  const { unit, unitRole, episodes } = worklist;
  const writable = canWrite(unitRole);
  const [resources, setResources] = useState<CareResource[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dispatchTarget, setDispatchTarget] = useState<CareEpisode | null>(null);
  const [assessTarget, setAssessTarget] = useState<CareEpisode | null>(null);
  const [transferTarget, setTransferTarget] = useState<CareEpisode | null>(null);
  const loadResources = () => fetchResources(unit.id).then(setResources).catch(() => undefined);
  useEffect(() => { void loadResources(); }, [unit.id, worklist.generatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { reload(); void loadResources(); };

  const missions = useMemo(() => [...episodes].sort((a, b) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [episodes]);
  const atStep = (...codes: string[]) => missions.filter((episode) => codes.includes(currentStage(episode)));
  const pending = atStep("CALL", "QUALIFIED");
  const active = missions.filter((episode) => stepIndex(currentStage(episode)) >= 2);
  const withPatient = missions.filter((episode) => stepIndex(currentStage(episode)) >= 5);
  const vehicles = resources.filter((item) => item.kind === "VEHICLE");

  const advance = async (episode: CareEpisode, code: string) => {
    if (code === "AVAILABLE") {
      try {
        const fresh = await fetchEpisode(episode.id);
        await changeEpisodeStatus(episode.id, { version: fresh.version, status: "COMPLETED", outcome: "MISSION_COMPLETED" });
        refresh();
      } catch { /* reported globally (closure needs the network) */ }
      return;
    }
    try {
      const saved = await recordCareEvent({
        careUnitId: unit.id, episodeId: episode.id, type: "MISSION_STEP", summary: MISSION_STEPS[stepIndex(code)].label, payload: { stage: code },
      }, `${MISSION_STEPS[stepIndex(code)].label} · ${patientName(episode.patient)}`);
      setNotice(isQueued(saved) ? "Hors ligne : l’étape est horodatée sur la tablette et sera transmise au retour du réseau." : null);
      refresh();
    } catch { /* reported globally */ }
  };

  const missionRow = (episode: CareEpisode, actions?: React.ReactNode) => {
    const stage = currentStage(episode);
    const engaged = episode.resources ?? [];
    return (
      <li key={episode.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openDossier(episode.id)}>
            <p className="font-semibold text-slate-900 dark:text-white">{patientName(episode.patient)} <span className="text-xs font-normal text-slate-500">{[genderLabel(episode.patient.gender), ageLabel(episode.patient)].filter(Boolean).join(" · ")}</span></p>
            <p className="text-xs text-slate-500">
              {episode.reason || "Motif non renseigné"}{episode.locationLabel ? ` · 📍 ${episode.locationLabel}` : ""} · ouverte {timeLabel(episode.createdAt)} ({durationLabel(minutesSince(episode.createdAt))})
              {engaged.length ? ` · ${engaged.map((item) => item.code).join(", ")}` : ""}
            </p>
          </button>
          <div className="flex items-center gap-1"><PriorityBadge priority={episode.priority} /><Badge tone="teal">{stepLabel(stage)}</Badge></div>
        </div>
        <ol className="mt-2 flex flex-wrap gap-1 text-[11px]">
          {MISSION_STEPS.slice(0, 9).map((step, index) => {
            const time = stepTime(episode, step.code);
            const done = index <= stepIndex(stage);
            return <li key={step.code} className={`rounded px-1.5 py-0.5 ${done ? "bg-aulia-teal/15 text-aulia-navy dark:text-aulia-mist" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>{step.label}{time ? ` ${new Date(time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}</li>;
          })}
        </ol>
        {writable && actions && <div className="mt-2 flex flex-wrap gap-1">{actions}</div>}
      </li>
    );
  };
  const list = (items: CareEpisode[], empty: string, actions?: (episode: CareEpisode) => React.ReactNode) =>
    items.length ? <ul className="space-y-2">{items.map((episode) => missionRow(episode, actions?.(episode)))}</ul> : <Empty>{empty}</Empty>;
  const nextStepButton = (episode: CareEpisode) => {
    const index = stepIndex(currentStage(episode));
    const next = MISSION_STEPS[index + 1];
    if (!next) return null;
    if (next.code === "DISPATCHED") return <Button small onClick={() => setDispatchTarget(episode)}>Engager une équipe</Button>;
    return <Button small tone={next.code === "AVAILABLE" ? "danger" : "primary"} onClick={() => void advance(episode, next.code)}>→ {next.label}</Button>;
  };

  let content: React.ReactNode = null;
  switch (tab) {
    case "overview":
      content = (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Appels à traiter" value={pending.length} tone={pending.length ? "amber" : undefined} />
            <Stat label="Missions en cours" value={active.length} />
            <Stat label="Patients à bord" value={atStep("PATIENT_CONTACT", "TRANSPORT").length} />
            <Stat label="Véhicules disponibles" value={vehicles.filter((item) => item.status === "AVAILABLE").length} tone={vehicles.length && !vehicles.some((item) => item.status === "AVAILABLE") ? "red" : undefined} />
            <Stat label="Véhicules engagés" value={vehicles.filter((item) => item.status === "ENGAGED").length} />
            <Stat label="Hors service" value={vehicles.filter((item) => item.status === "UNAVAILABLE" || item.status === "MAINTENANCE").length} />
          </div>
          <Card title="Missions">{list(missions, "Aucune mission ouverte.", nextStepButton)}</Card>
        </div>
      );
      break;
    case "calls":
      content = (
        <div className="grid gap-4 xl:grid-cols-2">
          <CallForm unitId={unit.id} disabled={!writable} onDone={() => { refresh(); setTab("dispatch"); }} />
          <div className="space-y-4">
            <Card title={`Demandes de transport reçues (${worklist.incomingRequests.length})`}>
              {!worklist.incomingRequests.length ? <Empty>Aucune demande des autres unités.</Empty> : (
                <ul className="space-y-2 text-sm">
                  {worklist.incomingRequests.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                      <span><strong>{request.label}</strong> · {patientName(request.patient)} · de {request.requesterUnit?.name ?? "—"} · {PRIORITY_LABELS[request.priority]}</span>
                      {writable && request.patient && <Button small onClick={() => void (async () => {
                        try {
                          const mission = await openEpisode({ careUnitId: unit.id, patientId: request.patient!.id, priority: request.priority, reason: request.label, sourceRequestId: request.id, start: true, stage: "QUALIFIED" });
                          refresh(); setDispatchTarget(mission as CareEpisode);
                        } catch { /* reported globally */ }
                      })()}>Créer la mission</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`Appels non engagés (${pending.length})`}>{list(pending, "Aucun appel en attente.", nextStepButton)}</Card>
          </div>
        </div>
      );
      break;
    case "dispatch":
      content = (
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Card title={`À engager (${pending.length})`}>{list(pending, "Aucun appel en attente d’équipe.", (episode) => <Button small onClick={() => setDispatchTarget(episode)}>Engager une équipe</Button>)}</Card>
          <Card title="Disponibilité">
            <ul className="space-y-1 text-sm">
              {resources.filter((item) => item.kind === "VEHICLE" || item.kind === "TEAM").map((item) => (
                <li key={item.id} className="flex justify-between"><span>{item.code} · {item.label}</span><Badge tone={item.status === "AVAILABLE" ? "green" : item.status === "ENGAGED" ? "teal" : "red"}>{item.status === "AVAILABLE" ? "Disponible" : item.status === "ENGAGED" ? "Engagé" : "Hors service"}</Badge></li>
              ))}
              {!resources.length && <Empty>Déclarez vos véhicules et équipes dans les onglets dédiés.</Empty>}
            </ul>
          </Card>
        </div>
      );
      break;
    case "missions":
      content = (
        <>
          {notice && <p className="mb-3 rounded-lg bg-aulia-mist p-2 text-sm text-aulia-navy">{notice}</p>}
          <Card title={`Interventions en cours (${active.length})`}>{list(active, "Aucune intervention en cours.", (episode) => (
            <>{nextStepButton(episode)}<Button small tone="secondary" onClick={() => setAssessTarget(episode)}>Bilan</Button></>
          ))}</Card>
          <p className="mt-2 text-xs text-slate-500">Les étapes sont horodatées au moment du clic, même sans réseau ; la clôture de la mission exige la connexion.</p>
        </>
      );
      break;
    case "patients":
      content = <Card title={`Patients pris en charge (${withPatient.length})`}>{list(withPatient, "Aucun patient pris en charge actuellement.", (episode) => (
        <><Button small tone="secondary" onClick={() => setAssessTarget(episode)}>Bilan préhospitalier</Button><Button small tone="secondary" onClick={() => setTransferTarget(episode)}>Pré-alerter l’unité d’accueil</Button></>
      ))}</Card>;
      break;
    case "teams":
      content = <ResourcesBoard unitId={unit.id} kind="TEAM" title="Équipes" resources={resources} role={unitRole} reload={() => void loadResources()} detailFields={[{ key: "members", label: "Membres" }, { key: "phone", label: "Téléphone" }]} />;
      break;
    case "vehicles":
      content = <ResourcesBoard unitId={unit.id} kind="VEHICLE" title="Véhicules" resources={resources} role={unitRole} reload={() => void loadResources()} detailFields={[{ key: "plate", label: "Immatriculation" }, { key: "type", label: "Type (A, B, C…)" }]} />;
      break;
    case "equipment":
      content = <ResourcesBoard unitId={unit.id} kind="EQUIPMENT" title="Équipements" resources={resources} role={unitRole} reload={() => void loadResources()} detailFields={[{ key: "serial", label: "N° de série" }, { key: "nextCheck", label: "Prochaine vérification" }]} />;
      break;
    case "transfers":
      content = (
        <div className="space-y-4">
          <Card title="Transmissions entrantes"><IncomingTransfers transfers={worklist.incomingTransfers} role={unitRole} onChanged={refresh} onOpenEpisode={openDossier} /></Card>
          <Card title="Pré-alerter une unité d’accueil">{list(withPatient, "Aucun patient à transmettre.", (episode) => <Button small onClick={() => setTransferTarget(episode)}>Transmettre le bilan</Button>)}</Card>
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
      {dispatchTarget && <DispatchDialog episode={dispatchTarget} unitId={unit.id} resources={resources} onClose={() => setDispatchTarget(null)} onDone={() => { setDispatchTarget(null); refresh(); }} />}
      {assessTarget && <AssessmentDialog episode={assessTarget} unitId={unit.id} onClose={() => setAssessTarget(null)} onDone={(message) => { setAssessTarget(null); setNotice(message); refresh(); }} />}
      {transferTarget && <TransferDialog episode={transferTarget} unit={unit} preset={{ toKind: "EMERGENCY", reason: "Pré-admission : patient transporté par le SMUR" }} onClose={() => setTransferTarget(null)} onDone={() => { setTransferTarget(null); refresh(); }} />}
    </>
  );
}

// ------------------------------------------------------------------ call intake
function CallForm({ unitId, disabled, onDone }: { unitId: string; disabled: boolean; onDone: () => void }) {
  const [known, setKnown] = useState<PatientSummary | null>(null);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState({ callerName: "", callerPhone: "", address: "", reason: "", victims: "1", priority: "URGENT" as CarePriority, gender: "UNKNOWN", age: "" });
  const [saving, setSaving] = useState(false);
  const ready = !disabled && form.reason.trim().length >= 2 && form.address.trim().length >= 2;
  const submit = async () => {
    setSaving(true);
    try {
      const mission = await registerArrival(unitId, {
        ...(known ? { patientId: known.id } : { provisional: { gender: form.gender, ...(form.age ? { estimatedAgeYears: Number(form.age) } : {}), description: `Appel : ${form.address.trim()}` } }),
        reason: form.reason.trim(), arrivalMode: "CALL", locationLabel: form.address.trim(),
      });
      await updateEpisode(mission.id, { version: mission.version, priority: form.priority }).catch(() => undefined);
      await recordCareEvent({
        careUnitId: unitId, episodeId: mission.id, type: "MISSION_STEP", summary: "Appel qualifié",
        payload: { stage: "QUALIFIED", caller: { name: form.callerName.trim(), phone: form.callerPhone.trim() }, address: form.address.trim(), victims: Number(form.victims) || 1, priority: form.priority },
      }, "Appel qualifié");
      setKnown(null); setForm({ callerName: "", callerPhone: "", address: "", reason: "", victims: "1", priority: "URGENT", gender: "UNKNOWN", age: "" });
      onDone();
    } catch { /* reported globally */ } finally { setSaving(false); }
  };
  return (
    <Card title="Nouvel appel">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Appelant"><input className={inputClass} value={form.callerName} onChange={(e) => setForm({ ...form, callerName: e.target.value })} /></Field>
        <Field label="Téléphone de rappel"><input className={inputClass} value={form.callerPhone} onChange={(e) => setForm({ ...form, callerPhone: e.target.value })} /></Field>
        <Field label="Lieu d’intervention"><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Quartier, avenue, repère…" /></Field>
        <Field label="Motif de l’appel"><input className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
        <Field label="Nombre de victimes"><input className={inputClass} type="number" min={1} value={form.victims} onChange={(e) => setForm({ ...form, victims: e.target.value })} /></Field>
        <Field label="Priorité retenue par le régulateur">
          <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as CarePriority })}>
            {(Object.keys(PRIORITY_LABELS) as CarePriority[]).map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
        {known ? (
          <div className="flex items-center justify-between"><span>Patient connu : <strong>{patientName(known)}</strong></span><Button small tone="ghost" onClick={() => setKnown(null)}>Retirer</Button></div>
        ) : searching ? (
          <PatientSearch onPick={(patient) => { setKnown(patient); setSearching(false); }} />
        ) : (
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <Field label="Sexe (si connu)">
              <select className={inputClass} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="UNKNOWN">Indéterminé</option><option value="MALE">Masculin</option><option value="FEMALE">Féminin</option>
              </select>
            </Field>
            <Field label="Âge estimé"><input className={inputClass} type="number" min={0} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></Field>
            <div className="flex items-end"><Button small tone="secondary" onClick={() => setSearching(true)}>Patient déjà connu ?</Button></div>
          </div>
        )}
        {!known && <p className="mt-2 text-xs text-slate-500">Sans identité, une identité provisoire est créée ; elle sera rattachée au vrai dossier à l’arrivée.</p>}
      </div>
      <div className="mt-4 flex justify-end"><Button disabled={!ready || saving} onClick={() => void submit()}>{saving ? "Enregistrement…" : "Enregistrer l’appel"}</Button></div>
    </Card>
  );
}

// ------------------------------------------------------------------ dispatch
function DispatchDialog({ episode, unitId, resources, onClose, onDone }: { episode: CareEpisode; unitId: string; resources: CareResource[]; onClose: () => void; onDone: () => void }) {
  const available = resources.filter((item) => item.status === "AVAILABLE" && (item.kind === "VEHICLE" || item.kind === "TEAM"));
  const [selected, setSelected] = useState<string[]>([]);
  const submit = async () => {
    try {
      for (const id of selected) {
        const resource = available.find((item) => item.id === id)!;
        await updateResource(id, { version: resource.version, assignedEpisodeId: episode.id });
      }
      await recordCareEvent({
        careUnitId: unitId, episodeId: episode.id, type: "MISSION_STEP", summary: `Équipe engagée : ${available.filter((item) => selected.includes(item.id)).map((item) => item.code).join(", ")}`,
        payload: { stage: "DISPATCHED", resources: selected },
      }, "Équipe engagée");
      onDone();
    } catch { /* reported globally */ }
  };
  return (
    <Dialog title={`Engager — ${patientName(episode.patient)}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">{episode.reason} {episode.locationLabel ? `· ${episode.locationLabel}` : ""}</p>
      {!available.length ? <Empty>Aucun véhicule ni équipe disponible.</Empty> : (
        <ul className="space-y-1">
          {available.map((item) => (
            <li key={item.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(item.id)} onChange={(e) => setSelected((rows) => e.target.checked ? [...rows, item.id] : rows.filter((id) => id !== item.id))} /> {item.kind === "VEHICLE" ? "🚑" : "👥"} {item.code} · {item.label}</label></li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button disabled={!selected.length} onClick={() => void submit()}>Engager</Button></div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ prehospital assessment
const ASSESSMENT_FIELDS = [
  { key: "circumstances", label: "Circonstances" }, { key: "airway", label: "A — Voies aériennes" }, { key: "breathing", label: "B — Respiration" },
  { key: "circulation", label: "C — Circulation / hémorragies" }, { key: "disability", label: "D — Neurologique (conscience, pupilles)" },
  { key: "exposure", label: "E — Lésions, température" }, { key: "actions", label: "Gestes réalisés" }, { key: "treatments", label: "Traitements administrés" },
] as const;
const VITALS = [
  { key: "bloodPressure", label: "TA" }, { key: "heartRate", label: "FC" }, { key: "respiratoryRate", label: "FR" }, { key: "spo2", label: "SpO₂" },
  { key: "temperature", label: "T°" }, { key: "glasgow", label: "Glasgow" }, { key: "glucose", label: "Glycémie" }, { key: "pain", label: "Douleur" },
] as const;

function AssessmentDialog({ episode, unitId, onClose, onDone }: { episode: CareEpisode; unitId: string; onClose: () => void; onDone: (message: string | null) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
  const submit = async () => {
    const vitals = Object.fromEntries(VITALS.filter((item) => filled[item.key]).map((item) => [item.key, filled[item.key]]));
    const findings = Object.fromEntries(ASSESSMENT_FIELDS.filter((item) => filled[item.key]).map((item) => [item.key, filled[item.key]]));
    const summary = [
      VITALS.filter((item) => vitals[item.key]).map((item) => `${item.label} ${vitals[item.key]}`).join(", "),
      ...ASSESSMENT_FIELDS.filter((item) => findings[item.key]).map((item) => `${item.label.split(" —")[0]} : ${findings[item.key]}`),
    ].filter(Boolean).join(" · ");
    try {
      const saved = await recordCareEvent({ careUnitId: unitId, episodeId: episode.id, type: "PREHOSPITAL_ASSESSMENT", summary, payload: { vitals, findings } }, `Bilan · ${patientName(episode.patient)}`);
      onDone(isQueued(saved) ? "Hors ligne : bilan gardé sur la tablette, transmis au retour du réseau." : "Bilan enregistré.");
    } catch { /* reported globally */ }
  };
  return (
    <Dialog title={`Bilan préhospitalier — ${patientName(episode.patient)}`} onClose={onClose} wide>
      <div className="grid gap-2 sm:grid-cols-4">
        {VITALS.map((item) => <Field key={item.key} label={item.label}><input className={inputClass} value={values[item.key] ?? ""} onChange={(e) => setValues({ ...values, [item.key]: e.target.value })} /></Field>)}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {ASSESSMENT_FIELDS.map((item) => <Field key={item.key} label={item.label}><textarea className={inputClass} rows={2} value={values[item.key] ?? ""} onChange={(e) => setValues({ ...values, [item.key]: e.target.value })} /></Field>)}
      </div>
      <p className="mt-2 text-xs text-slate-500">Horodaté à l’enregistrement. Disponible hors ligne. Le bilan peut être complété plusieurs fois pendant la mission.</p>
      <div className="mt-4 flex justify-end gap-2"><Button tone="ghost" onClick={onClose}>Annuler</Button><Button disabled={!Object.keys(filled).length} onClick={() => void submit()}>Enregistrer le bilan</Button></div>
    </Dialog>
  );
}
