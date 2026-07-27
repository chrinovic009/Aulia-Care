import { useCallback, useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

type DashboardOverview = {
  period: string;
  filters: { modality: string; service: string };
  metrics: {
    totalScheduled: number;
    realized: number;
    pending: number;
    averageWaitMinutes: number;
    averageDurationMinutes: number;
    occupancyRate: number;
  };
  hourlyActivity: Array<{ hour: string; emergencies: number; hospitalized: number; ambulatory: number; total: number }>;
  modalityBreakdown: Array<{ modality: string; count: number; percentage: number }>;
  workflowAlerts: Array<{ id: string; patientName: string; modality: string; severity: string; waitingMinutes: number; createdAt: string }>;
  activeQueue: Array<{ id: string; patientName: string; modality: string; status: string; room: string; updatedAt: string }>;
  equipmentStatus: Array<{ id: string; name: string; roomNumber?: string | null; isOperational: boolean; status: string; alertCount: number; updatedAt: string }>;
};

type FilterState = {
  period: string;
  modality: string;
  service: string;
};

const periodOptions = [
  { value: "TODAY", label: "Aujourd'hui" },
  { value: "YESTERDAY", label: "Hier" },
  { value: "WEEK", label: "Cette semaine" },
  { value: "MONTH", label: "Mois en cours" },
];

const modalityOptions = [
  { value: "ALL", label: "Toutes" },
  { value: "MRI", label: "IRM" },
  { value: "CT", label: "Scanner" },
  { value: "ULTRASOUND", label: "Échographie" },
  { value: "RADIOGRAPHY", label: "Radiographie" },
];

const serviceOptions = [
  { value: "ALL", label: "Tous" },
  { value: "EMERGENCY", label: "Urgences" },
  { value: "HOSPITALIZATION", label: "Hospitalisation" },
  { value: "AMBULATORY", label: "Ambulatoire" },
];

export default function DashboardRadio() {
  const [filters, setFilters] = useState<FilterState>({ period: "TODAY", modality: "ALL", service: "ALL" });
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRealtime, setIsRealtime] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch<DashboardOverview>(`/imaging/dashboard/overview?period=${filters.period}&modality=${filters.modality}&service=${filters.service}`);
      setData(response);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de charger le tableau de bord radiologie.");
    } finally {
      setLoading(false);
    }
  }, [filters.period, filters.modality, filters.service]);

  useEffect(() => {
    void load();
    if (!isRealtime) return;
    const timer = window.setInterval(() => { void load(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [load, isRealtime]);

  const summaryCards = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Examens du jour", value: data.metrics.totalScheduled, tone: "blue", description: `${data.metrics.realized} réalisés` },
      { label: "Temps d’attente moyen", value: `${data.metrics.averageWaitMinutes} min`, tone: "amber", description: "Depuis l’arrivée et la préparation" },
      { label: "Durée moyenne", value: `${data.metrics.averageDurationMinutes} min`, tone: "emerald", description: "Examen réalisé" },
      { label: "Occupation du plateau", value: `${data.metrics.occupancyRate}%`, tone: data.metrics.occupancyRate >= 75 ? "red" : data.metrics.occupancyRate >= 50 ? "amber" : "green", description: "Taux d’usage réel" },
    ];
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Radiologie | Dashboard" description="Tableau de bord RIS-PACS basé sur les données backend" />

      <section className="rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Aulia Care · Imagerie médicale</p>
            <h1 className="mt-2 text-2xl font-semibold">Dashboard Radiologie</h1>
            <p className="mt-2 text-sm text-slate-300">Vue en temps réel du flux des patients, des KPI et de l’état du parc d’équipements.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${isRealtime ? "bg-emerald-500" : "bg-slate-500"}`} />
            {isRealtime ? "Synchronisation temps réel active" : "Synchronisation manuel"}
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Période
            <select value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Modalité
            <select value={filters.modality} onChange={(event) => setFilters((current) => ({ ...current, modality: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              {modalityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Service demandeur
            <select value={filters.service} onChange={(event) => setFilters((current) => ({ ...current, service: event.target.value }))} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              {serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button onClick={() => setIsRealtime((current) => !current)} className={`w-full rounded-lg px-3 py-2 text-sm font-semibold ${isRealtime ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200"}`}>
              {isRealtime ? "Temps réel activé" : "Activer temps réel"}
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</div> : null}

      {loading ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
        </div>
      ) : !data ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900">Aucune donnée disponible pour cette période.</div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-white">{card.value}</p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{card.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Activité horaire</h2>
                <p className="text-sm text-slate-500">Volume réel d’examens par heure</p>
              </div>
              <div className="mt-4 space-y-3">
                {data.hourlyActivity.length === 0 ? <EmptyState label="Aucune activité horaire trouvée pour cette sélection." /> : data.hourlyActivity.map((item) => (
                  <div key={item.hour} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                      <span>{item.hour}</span>
                      <span>{item.total} examens</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <div className="h-2 flex-1 rounded-full bg-red-100"><div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.min(100, item.emergencies * 20)}%` }} /></div>
                      <div className="h-2 flex-1 rounded-full bg-amber-100"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${Math.min(100, item.hospitalized * 20)}%` }} /></div>
                      <div className="h-2 flex-1 rounded-full bg-blue-100"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, item.ambulatory * 20)}%` }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Répartition par modalité</h2>
                <p className="text-sm text-slate-500">Volumes réels</p>
              </div>
              <div className="mt-4 space-y-3">
                {data.modalityBreakdown.length === 0 ? <EmptyState label="Aucune répartition disponible." /> : data.modalityBreakdown.map((entry) => (
                  <div key={entry.modality} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{entry.modality}</span>
                      <span className="text-slate-500">{entry.count} · {entry.percentage}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-2 rounded-full bg-blue-600" style={{ width: `${entry.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Alertes de compte-rendu</h2>
                <p className="text-sm text-slate-500">Retards de validation</p>
              </div>
              <div className="mt-4 space-y-3">
                {data.workflowAlerts.length === 0 ? <EmptyState label="Aucune alerte récente." /> : data.workflowAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{alert.patientName}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alert.severity === "CRITIQUE" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{alert.severity}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{alert.modality} · retard {alert.waitingMinutes} min</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">File d’attente active</h2>
                <p className="text-sm text-slate-500">Préparation / acquisition / validation</p>
              </div>
              <div className="mt-4 space-y-3">
                {data.activeQueue.length === 0 ? <EmptyState label="Aucune demande en cours." /> : data.activeQueue.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{item.patientName}</p>
                      <span className="text-xs font-semibold uppercase text-blue-600">{item.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.modality} · {item.room}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">État du parc machines</h2>
              <p className="text-sm text-slate-500">Statuts réels de maintenance et d’utilisation</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.equipmentStatus.length === 0 ? <EmptyState label="Aucun équipement répertorié." /> : data.equipmentStatus.map((machine) => (
                <div key={machine.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900 dark:text-white">{machine.name}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${machine.isOperational ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{machine.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Salle : {machine.roomNumber || "—"}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Alertes : {machine.alertCount}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonCard() {
  return <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" /><div className="mt-4 h-8 w-20 rounded bg-slate-200 dark:bg-slate-800" /><div className="mt-3 h-3 w-32 rounded bg-slate-200 dark:bg-slate-800" /></div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{label}</div>;
}
