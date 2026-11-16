import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import PageMeta from "../../components/common/PageMeta";
import { fetchWorklist, KIND_LABELS, patientName, timeLabel, type Worklist } from "../../api/careWorkflow";
import { EpisodeDossier, HistoryList, IncomingTransfers, PatientSearch, TaskList } from "./shared";
import { Badge, Button, Card, Empty, PriorityBadge, Stat } from "./ui";
import { EMERGENCY_TABS, UrgencesModule, type EmergencyTab } from "./urgences/UrgencesModule";
import { STAGE_LABELS } from "./urgences/emergencySettings";
import { AMBULANCE_TABS, AmbulanceModule, MISSION_STEPS, type AmbulanceTab } from "./ambulance/AmbulanceModule";
import { MATERNITY_STAGES, MATERNITY_TABS, MaterniteModule, type MaternityTab } from "./maternite/MaterniteModule";
import { ChirurgieModule, SURGERY_STAGE_LABELS, SURGERY_TABS, type SurgeryTab } from "./chirurgie/ChirurgieModule";
import { ProtocolValidationBanner } from "./ProtocolValidation";
import { DIALYSIS_STAGE_LABELS, DIALYSIS_TABS, DialyseModule, type DialysisTab } from "./dialyse/DialyseModule";

const REFRESH_MS = 20_000;
const COMMON_TABS = [
  { id: "overview", label: "Vue d’ensemble" }, { id: "queue", label: "File active" }, { id: "tasks", label: "Tâches" },
  { id: "transfers", label: "Transmissions" }, { id: "history", label: "Historique" },
] as const;

/**
 * Workspace of one care unit: common functions for every unit (work queue,
 * search, tasks, hand-offs, history, record) plus the unit's own module.
 */
export default function UnitWorkspace() {
  const { unitId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [worklist, setWorklist] = useState<Worklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(() => fetchWorklist(unitId).then((data) => { setWorklist(data); setError(null); })
    .catch(() => setError("La file de l’unité n’a pas pu être actualisée (réseau ou droits). Les données affichées peuvent dater.")), [unitId]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const kind = worklist?.unit.kind;
  const tabs = useMemo(() => (kind === "EMERGENCY" ? EMERGENCY_TABS : kind === "AMBULANCE" ? AMBULANCE_TABS : kind === "MATERNITY" ? MATERNITY_TABS : kind === "SURGERY" ? SURGERY_TABS : kind === "DIALYSIS" ? DIALYSIS_TABS : COMMON_TABS), [kind]);
  const tab = (params.get("onglet") ?? tabs[0].id) as string;
  const setTab = (value: string) => setParams((current) => { const next = new URLSearchParams(current); next.set("onglet", value); return next; }, { replace: true });

  if (!worklist) {
    return <div className="p-6 text-sm text-slate-500">{error ?? "Chargement de l’unité…"} <Link className="ml-2 underline" to="/unites">Mes unités</Link></div>;
  }
  const { unit, unitRole } = worklist;
  const openEpisodeOf = (patientId: string) => {
    const episode = worklist.episodes.find((item) => item.patientId === patientId);
    if (episode) { setDossier(episode.id); setSearching(false); }
  };

  return (
    <>
      <PageMeta title={`${unit.name} | Aulia Care`} description={`Espace de travail de l’unité ${unit.name}`} />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/unites" className="text-xs text-slate-500 underline">Mes unités</Link>
            <h1 className="text-2xl font-bold text-aulia-navy dark:text-white">{unit.name} <span className="text-base font-normal text-slate-500">· {KIND_LABELS[unit.kind]}</span></h1>
            <p className="text-xs text-slate-500">
              {unitRole === "READ_ONLY" ? "Consultation seule" : unitRole === "LEAD" ? "Responsable d’unité" : "Membre de l’unité"} · actualisé {timeLabel(worklist.generatedAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button tone="secondary" onClick={() => setSearching((value) => !value)}>Rechercher un patient présent</Button>
            <Button tone="ghost" onClick={() => void load()}>Actualiser</Button>
          </div>
        </div>
        {error && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
        {searching && (
          <Card title="Recherche rapide">
            <PatientSearch onPick={(patient) => openEpisodeOf(patient.id)} />
            <p className="mt-2 text-xs text-slate-500">Seuls les patients présents dans l’unité ouvrent leur dossier ici ; l’accès aux autres dossiers suit vos droits.</p>
          </Card>
        )}
        <ProtocolValidationBanner unit={unit} unitRole={unitRole} onValidated={() => void load()} />
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" aria-label="Onglets de l’unité">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === item.id ? "border-aulia-teal text-aulia-teal" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}>
              {item.label}
            </button>
          ))}
        </nav>
        {unit.kind === "EMERGENCY"
          ? <UrgencesModule worklist={worklist} tab={tab as EmergencyTab} reload={() => void load()} openDossier={setDossier} setTab={(value) => setTab(value)} />
          : unit.kind === "SURGERY"
          ? <ChirurgieModule worklist={worklist} tab={tab as SurgeryTab} reload={() => void load()} openDossier={setDossier} />
          : unit.kind === "DIALYSIS"
          ? <DialyseModule worklist={worklist} tab={tab as DialysisTab} reload={() => void load()} openDossier={setDossier} />
          : unit.kind === "MATERNITY"
          ? <MaterniteModule worklist={worklist} tab={tab as MaternityTab} reload={() => void load()} openDossier={setDossier} />
          : unit.kind === "AMBULANCE"
          ? <AmbulanceModule worklist={worklist} tab={tab as AmbulanceTab} reload={() => void load()} openDossier={setDossier} setTab={(value) => setTab(value)} />
          : <CommonModule worklist={worklist} tab={tab} reload={() => void load()} openDossier={setDossier} />}
      </div>
      {dossier && <EpisodeDossier episodeId={dossier} unit={unit} role={unitRole} stageLabels={unit.kind === "EMERGENCY" ? STAGE_LABELS : unit.kind === "AMBULANCE" ? Object.fromEntries(MISSION_STEPS.map((step) => [step.code, step.label])) : unit.kind === "MATERNITY" ? MATERNITY_STAGES : unit.kind === "SURGERY" ? SURGERY_STAGE_LABELS : unit.kind === "DIALYSIS" ? DIALYSIS_STAGE_LABELS : undefined} onClose={() => setDossier(null)} onChanged={() => void load()} />}
    </>
  );
}

/** Common functions, used by units whose dedicated module is not built yet. */
function CommonModule({ worklist, tab, reload, openDossier }: { worklist: Worklist; tab: string; reload: () => void; openDossier: (id: string) => void }) {
  const { unit, unitRole, episodes, tasks, incomingTransfers } = worklist;
  if (tab === "tasks") return <Card title="Tâches en attente"><TaskList tasks={tasks} role={unitRole} onChanged={reload} /></Card>;
  if (tab === "transfers") return <Card title="Transmissions entrantes"><IncomingTransfers transfers={incomingTransfers} role={unitRole} onChanged={reload} onOpenEpisode={openDossier} /></Card>;
  if (tab === "history") return <HistoryList unitId={unit.id} onOpen={openDossier} />;
  const queue = (
    <Card title={`File active (${episodes.length})`}>
      {!episodes.length ? <Empty>Aucun patient pris en charge.</Empty> : (
        <ul className="space-y-2">
          {episodes.map((episode) => (
            <li key={episode.id}>
              <button type="button" onClick={() => openDossier(episode.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-left text-sm dark:border-slate-800">
                <span className="font-semibold">{patientName(episode.patient)}</span>
                <span className="flex items-center gap-2">{episode.stage && <Badge tone="teal">{episode.stage}</Badge>}<PriorityBadge priority={episode.priority} /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
  if (tab === "queue") return queue;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Pris en charge" value={episodes.length} />
        <Stat label="Tâches en attente" value={tasks.length} />
        <Stat label="Transmissions entrantes" value={incomingTransfers.length} tone={incomingTransfers.length ? "amber" : undefined} />
        <Stat label="Demandes reçues" value={worklist.incomingRequests.length} />
      </div>
      <p className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600 dark:border-slate-800">Le module dédié à l’unité « {KIND_LABELS[unit.kind]} » arrive ; les fonctions communes sont déjà opérationnelles.</p>
      {queue}
    </div>
  );
}
