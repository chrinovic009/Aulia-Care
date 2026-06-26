import { useEffect, useMemo, useState } from "react";
import { Plus, Search, ShieldCheck, ClipboardList, ListChecks, Users } from "lucide-react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";
import { AdminPageShell, Panel, StatCard, DataTable, formatDate } from "../Administration/adminUi";
import { fetchLaboratoryRequests } from "../../api/laboratory";

type LabRequestListItem = {
  id: string;
  status: string;
  priority?: string | null;
  requestedAt: string;
  completedAt?: string | null;
  patient?: { firstName?: string | null; lastName?: string | null };
  requestedBy?: { displayName?: string | null; firstName?: string | null; lastName?: string | null };
};

export default function GestionLaboratoire() {
  const [requests, setRequests] = useState<LabRequestListItem[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [labMetrics, setLabMetrics] = useState({ total: 0, pending: 0, completed: 0, rejected: 0 });

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await fetchLaboratoryRequests();
      setRequests(data);
      setLabMetrics({
        total: data.length,
        pending: data.filter((item) => ["REQUESTED", "COLLECTED", "RECEIVED", "IN_ANALYSIS"].includes(item.status)).length,
        completed: data.filter((item) => ["AVAILABLE", "SENT"].includes(item.status)).length,
        rejected: data.filter((item) => ["REJECTED", "CANCELLED"].includes(item.status)).length,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const filteredRequests = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesStatus = statusFilter === "ALL" || request.status === statusFilter;
      const haystack = [
        request.patient?.firstName,
        request.patient?.lastName,
        request.requestedBy?.displayName,
        request.requestedBy?.firstName,
        request.requestedBy?.lastName,
        request.priority,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [query, requests, statusFilter]);

  return (
    <AdminPageShell
      title="Gestion laboratoire"
      subtitle="Superviser les flux de demandes, la configuration d'examens et la traçabilité des prélèvements."
      actions={
        <button onClick={loadRequests} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          <RefreshIcon /> Actualiser
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <Panel title="Indicateurs clés">
            <div className="grid gap-3">
              <StatCard icon={<ClipboardList />} label="Demandes totales" value={labMetrics.total} tone="blue" />
              <StatCard icon={<ListChecks />} label="Demandes en cours" value={labMetrics.pending} tone="amber" />
              <StatCard icon={<ShieldCheck />} label="Demandes traitées" value={labMetrics.completed} tone="green" />
              <StatCard icon={<Users />} label="Demandes rejetées" value={labMetrics.rejected} tone="red" />
            </div>
          </Panel>

          <Panel title="Recherche">
            <label className="block text-sm">
              <span className="mb-2 block text-slate-600 dark:text-slate-300">Patient ou demande</span>
              <div className="relative">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Rechercher par patient, priorite, medecin..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </label>
            <label className="block text-sm">
              <span className="mb-2 block text-slate-600 dark:text-slate-300">Filtrer par etat</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                <option value="ALL">Tous</option>
                <option value="REQUESTED">Demandes</option>
                <option value="COLLECTED">Collectés</option>
                <option value="RECEIVED">Reçus</option>
                <option value="IN_ANALYSIS">Analyse</option>
                <option value="TECHNICAL_VALIDATION">Validation technique</option>
                <option value="BIOLOGICAL_VALIDATION">Validation biologique</option>
                <option value="AVAILABLE">Disponible</option>
                <option value="SENT">Envoyé</option>
                <option value="REJECTED">Rejeté</option>
              </select>
            </label>
          </Panel>
        </aside>

        <section className="space-y-4">
          <Panel title="Demandes de laboratoire">
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <DataTable
                headers={["Demande", "Patient", "Statut", "Priorité", "Demandé le", "Actions"]}
                rows={filteredRequests.map((request) => [
                  request.id,
                  `${request.patient?.firstName || "-"} ${request.patient?.lastName || ""}`.trim(),
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{request.status}</span>,
                  request.priority || "NORMAL",
                  formatDate(request.requestedAt),
                  <button className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Voir</button>,
                ])}
              />
            </div>
          </Panel>

          <Panel title="Taches prioritaires" subtitle="Surveillez les demandes critiques et les statuts bloquants.">
            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm text-slate-500 dark:text-slate-400">Examens en attente de validation technique</p>
                <p className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">{requests.filter((item) => item.status === "TECHNICAL_VALIDATION").length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm text-slate-500 dark:text-slate-400">Examens en attente de validation biologique</p>
                <p className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">{requests.filter((item) => item.status === "BIOLOGICAL_VALIDATION").length}</p>
              </div>
            </div>
          </Panel>
        </section>
      </div>
    </AdminPageShell>
  );
}

function RefreshIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4"><path fill="currentColor" d="M17.65 6.35a7.95 7.95 0 0 0-11.3 0l1.45 1.45A5.98 5.98 0 0 1 12 8c1.66 0 3.16.69 4.24 1.76A5.98 5.98 0 0 1 18 14h-1.5l2 2 2-2H18c0-1.1-.9-2-2-2-.55 0-1.05.22-1.41.59L14 10.5l3.65-3.65zM12 4c1.1 0 2 .9 2 2h-1.5l2 2 2-2H14c0-1.1-.9-2-2-2-1.05 0-1.97.68-2.3 1.6L7.95 5.7A7.95 7.95 0 0 0 4 12c0 4.42 3.58 8 8 8s8-3.58 8-8h-2c0 3.31-2.69 6-6 6s-6-2.69-6-6c0-1.64.66-3.13 1.73-4.24l1.41 1.41C7.7 9.95 7 10.93 7 12c0 2.76 2.24 5 5 5s5-2.24 5-5H7l1.65-1.65C9.35 8.35 10.58 7 12 7c1.13 0 2.17.5 2.9 1.3L12 14l-3-3h1.5c-.85 0-1.67.33-2.28.94L5 10c.72-1.16 1.84-2.05 3.17-2.56C9.86 6.78 10.92 6 12 6z"/></svg>;
}
