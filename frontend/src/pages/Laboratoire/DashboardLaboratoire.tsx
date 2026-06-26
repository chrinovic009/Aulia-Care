import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

type LabRequest = {
  id: string;
  status: string;
  requestedAt: string;
  completedAt?: string | null;
  specimenType?: string | null;
  priority?: string | null;
  notes?: string | null;
  patient?: { firstName?: string; lastName?: string; phone?: string | null };
  requestedBy?: { displayName?: string | null; firstName?: string | null; lastName?: string | null };
  consultation?: { provider?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null } | null;
  results?: Array<{ id: string; resultName: string; resultValue: string; units?: string | null; interpretation?: string | null; verified: boolean; reportedAt: string }>;
};

const formatName = (request: LabRequest) =>
  [request.patient?.firstName, request.patient?.lastName].filter(Boolean).join(" ") || "Patient non renseigne";

const formatUserName = (user?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null) =>
  user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "-";

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";

export default function DashboardLaboratoire() {
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  // Dashboard data (read-only supervision)
  const [overview, setOverview] = useState<any | null>(null);
  const [workflow, setWorkflow] = useState<Record<string, number>>({});
  const [alerts, setAlerts] = useState<any[]>([]);
  const [validations,] = useState<any[]>([]);
  const [performance,] = useState<any | null>(null);
  const [topTests,] = useState<any[]>([]);
  const [staffPerformance,] = useState<any[]>([]);
  const [inventory,] = useState<any | null>(null);
  const [revenue,] = useState<any | null>(null);
  const [quality,] = useState<any | null>(null);
  const [recentActivity,] = useState<any[]>([]);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<LabRequest[]>("/laboratory");
      setRequests(data);
      setSelectedRequest((current) => current || data[0] || null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const data = await apiFetch('/laboratory/dashboard/overview');
      setOverview(data);
    } catch (err) {
      console.error('Unable to load laboratory overview', err);
      setOverview(null);
    }
  };

  const loadWorkflow = async () => {
    try {
      const data = await apiFetch('/laboratory/dashboard/workflow');
      setWorkflow(data || {});
    } catch (err) {
      console.error('Unable to load workflow', err);
      setWorkflow({});
    }
  };

  const loadAlerts = async () => {
    try {
      const data = await apiFetch('/laboratory/dashboard/alerts');
      setAlerts(data || []);
    } catch (err) {
      console.error('Unable to load alerts', err);
      setAlerts([]);
    }
  };

  useEffect(() => {
    loadRequests();
    const handler = () => {
      loadRequests();
      loadMetrics();
      loadWorkflow();
      loadAlerts();
    };
    window.addEventListener("d7:consultation.created", handler);
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:clinicalDataUpdated", handler);
    window.addEventListener("d7:lab.request.created", handler);
    window.addEventListener("d7:lab.result.created", handler);
    return () => {
      window.removeEventListener("d7:consultation.created", handler);
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:clinicalDataUpdated", handler);
      window.removeEventListener("d7:lab.request.created", handler);
      window.removeEventListener("d7:lab.result.created", handler);
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesStatus = statusFilter === "ALL" || request.status === statusFilter;
      const haystack = [formatName(request), request.specimenType, request.priority, request.notes, formatUserName(request.requestedBy)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [requests, query, statusFilter]);

  const metrics = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((request) => ["REQUESTED", "IN_PROGRESS"].includes(request.status)).length,
    completed: requests.filter((request) => ["COMPLETED", "VERIFIED"].includes(request.status)).length,
    urgent: requests.filter((request) => ["URGENT", "CRITICAL"].includes((request.priority || "").toUpperCase())).length,
  }), [requests]);

  // Dashboard is read-only: no creation or modification allowed here

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Laboratoire | D7 Clinique" description="Demandes d'examens et resultats en temps reel." />
      <PageBreadcrumb pageTitle="Laboratoire" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Examens laboratoire</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Reception, execution et validation des resultats patients.</p>
          </div>
          <button onClick={loadRequests} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Actualiser</button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-5">
          <Metric label="Total demandes" value={metrics.total} />
          <Metric label="Total validées" value={metrics.total} />
          <Metric label="Total en attente" value={metrics.pending} tone="amber" />
          <Metric label="Total terminees" value={metrics.completed} tone="green" />
          <Metric label="Total urgentes" value={metrics.urgent} tone="red" />
        </div>
      </section>

      

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-[1fr_150px] xl:grid-cols-1">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher patient, examen, medecin..." className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white">
              <option value="ALL">Tous</option>
              <option value="REQUESTED">Demandes</option>
              <option value="IN_PROGRESS">En cours</option>
              <option value="COMPLETED">Completes</option>
              <option value="VERIFIED">Verifiees</option>
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <p className="text-sm text-slate-500">Chargement...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune demande trouvee.</p>
            ) : filtered.map((request) => (
              <button
                key={request.id}
                onClick={() => setSelectedRequest(request)}
                className={`w-full rounded-lg border p-3 text-left transition ${selectedRequest?.id === request.id ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{formatName(request)}</p>
                    <p className="mt-1 text-xs text-slate-500">{request.specimenType || "Examen"} - {formatDate(request.requestedAt)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
                <p className="mt-2 text-xs text-slate-500">Medecin: {formatUserName(request.requestedBy || request.consultation?.provider)}</p>
              </button>
            ))}
          </div>
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Centre de supervision</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              {/* KPI cards driven by overview endpoint */}
              <Metric label="Demandes reçues aujourd'hui" value={overview?.requestsToday ?? 0} />
              <Metric label="Examens réalisés aujourd'hui" value={overview?.examsToday ?? 0} />
              <Metric label="Résultats en attente" value={overview?.resultsPending ?? 0} tone="amber" />
              <Metric label="Validés aujourd'hui" value={overview?.resultsValidatedToday ?? 0} tone="green" />
              <Metric label="Examens en retard" value={overview?.overdue ?? 0} tone="red" />
              <Metric label="Revenu du jour" value={overview?.revenueToday ?? 0} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-3">
              <Panel title="Workflow temps réel">
                {Object.keys(workflow).length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune donnée de workflow disponible.</p>
                ) : (
                  <div className="grid gap-2">
                    {Object.entries(workflow).map(([step, count]) => (
                      <div key={step} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                        <div className="text-sm text-slate-700 dark:text-slate-300">{step}</div>
                        <div className="font-semibold text-slate-900 dark:text-white">{count}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Alertes critiques">
                {alerts.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune alerte critique.</p>
                ) : (
                  alerts.map((a, idx) => (
                    <div key={idx} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <div className="font-semibold">{a.title || 'URGENT'}</div>
                      <div className="text-xs">{a.message}</div>
                      <div className="mt-1 text-xs text-slate-600">{a.meta || ''}</div>
                    </div>
                  ))
                )}
              </Panel>

              <Panel title="Validations en attente">
                {validations.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune validation en attente.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500">
                          <th>Patient</th>
                          <th>Examen</th>
                          <th>Laborantin</th>
                          <th>Date saisie</th>
                          <th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validations.map((v: any) => (
                          <tr key={v.id} className="border-t">
                            <td className="py-2">{v.patientName}</td>
                            <td className="py-2">{v.testName}</td>
                            <td className="py-2">{v.technicianName || '-'}</td>
                            <td className="py-2">{v.enteredAt ? new Date(v.enteredAt).toLocaleString('fr-FR') : '-'}</td>
                            <td className="py-2">{v.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-3">
              <Panel title="Performance du laboratoire">
                {performance ? (
                  <div className="text-sm">
                    <div>Nombre d'examens: {performance.totalExams ?? '—'}</div>
                    <div>Temps moyen: {performance.avgTurnaround ?? '—'}</div>
                    <div>Taux de validation: {performance.validationRate ?? '—'}</div>
                    <div>Taux de rejet: {performance.rejectionRate ?? '—'}</div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aucune donnée de performance.</p>
                )}
              </Panel>

              <Panel title="Top examens demandés">
                {topTests.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun examen disponible.</p>
                ) : (
                  <ol className="list-decimal list-inside text-sm">
                    {topTests.map((t: any, idx: number) => (
                      <li key={idx} className="py-1">{t.testName} — {t.count}</li>
                    ))}
                  </ol>
                )}
              </Panel>

              <Panel title="Productivité du personnel">
                {staffPerformance.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune donnée.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {staffPerformance.map((s: any) => (
                      <div key={s.userId} className="flex items-center justify-between rounded-lg bg-slate-50 p-2 dark:bg-slate-950">
                        <div>{s.name}</div>
                        <div className="text-slate-600">{s.examsPerformed} exams</div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-3">
              <Panel title="Surveillance du stock">
                {inventory ? (
                  <div className="text-sm">
                    <div>Articles critiques: {inventory.criticalCount ?? 0}</div>
                    <div>Réactifs proches expiration: {inventory.expiringSoon ?? 0}</div>
                    <div>Articles épuisés: {inventory.outOfStock ?? 0}</div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aucune donnée d'inventaire.</p>
                )}
              </Panel>

              <Panel title="Revenus">
                {revenue ? (
                  <div className="text-sm">
                    <div>Aujourd'hui: {revenue.today ?? '—'}</div>
                    <div>Cette semaine: {revenue.week ?? '—'}</div>
                    <div>Ce mois: {revenue.month ?? '—'}</div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aucune donnée financière.</p>
                )}
              </Panel>

              <Panel title="Indicateurs qualité">
                {quality ? (
                  <div className="text-sm">
                    <div>Taux validation biologique: {quality.biologicalValidationRate ?? '—'}</div>
                    <div>Taux de rejet: {quality.rejectionRate ?? '—'}</div>
                    <div>Temps moyen: {quality.avgTurnaround ?? '—'}</div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Aucune donnée qualité.</p>
                )}
              </Panel>
            </div>

            <div className="mt-6">
              <Panel title="Historique récent">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune activité récente.</p>
                ) : (
                  <ul className="text-sm space-y-2">
                    {recentActivity.map((a: any, idx: number) => (
                      <li key={idx} className="text-slate-700 dark:text-slate-300">{a.when} — {a.description}</li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" | "green" | "red" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    amber: "text-amber-700 dark:text-amber-300",
    green: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
  };
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3><div className="mt-3 space-y-3">{children}</div></div>;
}

// Note: Input and Info helpers removed — dashboard is read-only supervision-only

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "VERIFIED" || status === "COMPLETED"
      ? "bg-emerald-100 text-emerald-700"
      : status === "REQUESTED"
      ? "bg-amber-100 text-amber-700"
      : "bg-blue-100 text-blue-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}
