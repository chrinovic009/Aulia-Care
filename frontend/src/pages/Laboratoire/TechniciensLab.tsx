import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, ClipboardList, RefreshCw, Search, ShieldCheck, TrendingUp, Users } from "lucide-react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { AdminPageShell, Panel, StatCard, formatDate } from "../Administration/adminUi";
import { apiFetch } from "../../config/api";

type PerformanceSummary = {
  totalAnalyses: number;
  completedAnalyses: number;
  acceptedValidations: number;
  rejectedValidations: number;
  correctionRequests: number;
  averageProcessingHours: number;
  averageReceptionToStartHours: number;
  averageAnalysisHours: number;
  delayRate: number;
  successRate: number;
  rejectionRate: number;
  dailyProductivity: number;
  weeklyProductivity: number;
  monthlyProductivity: number;
  productivityLevel: string;
};

type HistoryEntry = {
  id: string;
  action: string;
  createdAt?: string | null;
  note?: string | null;
  patientName: string;
  testName: string;
  status: string;
};

type RefusedValidation = {
  id: string;
  patientName: string;
  testName: string;
  decisionDate?: string | null;
  reason: string;
  observations: string;
};

type TechnicianSummary = {
  id: string;
  fullName: string;
  matricule: string;
  function: string;
  laboratory: string;
  team: string;
  status: string;
  availability: string;
  lastActivityAt?: string | null;
  workload: {
    pending: number;
    inProgress: number;
    completed: number;
    validated: number;
    corrections: number;
    rejected: number;
    urgent: number;
  };
  performance?: PerformanceSummary;
  assignedItems: Array<{
    id: string;
    requestId?: string;
    patientName: string;
    testName: string;
    status: string;
    priority: string;
  }>;
  recentEvents: HistoryEntry[];
  history?: HistoryEntry[];
  reassignments?: HistoryEntry[];
  refusedValidations?: RefusedValidation[];
};

type TechnicianPayload = {
  technicians: TechnicianSummary[];
  unassignedItems: Array<{
    id: string;
    requestId?: string;
    patientName: string;
    testName: string;
    status: string;
    requestedAt?: string | null;
    priority: string;
  }>;
};

export default function TechniciensLab() {
  const [payload, setPayload] = useState<TechnicianPayload>({ technicians: [], unassignedItems: [] });
  const [selectedTechnician, setSelectedTechnician] = useState<TechnicianSummary | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [technicianId, setTechnicianId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ team: "all", availability: "all", productivity: "all", period: "all" });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<TechnicianPayload>("/laboratory/technicians");
      setPayload(data);
      setSelectedTechnician((current) => current || data.technicians?.[0] || null);
    } catch (error) {
      console.error("Impossible de charger les techniciens laboratoire", error);
      setPayload({ technicians: [], unassignedItems: [] });
      setSelectedTechnician(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredTechnicians = useMemo(() => {
    const term = search.toLowerCase();
    return payload.technicians.filter((technician) => {
      const haystack = `${technician.fullName} ${technician.matricule} ${technician.team} ${technician.laboratory}`.toLowerCase();
      const matchesSearch = haystack.includes(term);
      const matchesTeam = filters.team === "all" || technician.team === filters.team;
      const matchesAvailability = filters.availability === "all" || technician.availability === filters.availability;
      const matchesProductivity = filters.productivity === "all" || technician.performance?.productivityLevel === filters.productivity;
      const matchesPeriod = filters.period === "all" || (filters.period === "day" && (technician.performance?.dailyProductivity ?? 0) > 0) || (filters.period === "week" && (technician.performance?.weeklyProductivity ?? 0) > 0) || (filters.period === "month" && (technician.performance?.monthlyProductivity ?? 0) > 0);
      return matchesSearch && matchesTeam && matchesAvailability && matchesProductivity && matchesPeriod;
    });
  }, [filters.availability, filters.period, filters.productivity, filters.team, payload.technicians, search]);

  useEffect(() => {
    if (!filteredTechnicians.some((technician) => technician.id === selectedTechnician?.id)) {
      setSelectedTechnician(filteredTechnicians[0] || null);
    }
  }, [filteredTechnicians, selectedTechnician?.id]);

  const assignItem = async () => {
    if (!selectedItemId || !technicianId) {
      setMessage("Sélectionnez un examen et un technicien.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch(`/laboratory/items/${selectedItemId}/assign`, {
        method: "POST",
        body: JSON.stringify({ technicianId, note: reason || undefined }),
      });
      setMessage("Attribution enregistrée.");
      setSelectedItemId("");
      setTechnicianId("");
      setReason("");
      await loadData();
    } catch (error) {
      console.error("Impossible d'attribuer l'analyse", error);
      setMessage("Impossible d'enregistrer l'attribution.");
    } finally {
      setSubmitting(false);
    }
  };

  const reassignItem = async () => {
    if (!selectedItemId || !technicianId) {
      setMessage("Sélectionnez un examen à réaffecter et un technicien cible.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch(`/laboratory/items/${selectedItemId}/reassign`, {
        method: "POST",
        body: JSON.stringify({ technicianId, reason: reason || undefined }),
      });
      setMessage("Réaffectation enregistrée.");
      setSelectedItemId("");
      setTechnicianId("");
      setReason("");
      await loadData();
    } catch (error) {
      console.error("Impossible de réaffecter l'analyse", error);
      setMessage("Impossible d'enregistrer la réaffectation.");
    } finally {
      setSubmitting(false);
    }
  };

  const teamOptions = useMemo(() => Array.from(new Set(payload.technicians.map((tech) => tech.team).filter(Boolean))), [payload.technicians]);

  return (
    <AdminPageShell
      title="Techniciens laboratoire"
      subtitle="Pilotage de l’équipe technique du laboratoire, attribution des analyses, charge de travail et historique d’activité."
      actions={
        <button onClick={loadData} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          <RefreshCw size={16} /> Actualiser
        </button>
      }
    >
      <PageMeta title="Techniciens laboratoire | D7 Clinique" description="Gestion des techniciens du laboratoire et supervision de leurs charges de travail." />
      <PageBreadcrumb pageTitle="Techniciens laboratoire" />

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<Users size={18} />} label="Techniciens" value={payload.technicians.length} tone="blue" />
        <StatCard icon={<ClipboardList size={18} />} label="Analyses non attribuées" value={payload.unassignedItems.length} tone="amber" />
        <StatCard icon={<TrendingUp size={18} />} label="Validations obtenues" value={payload.technicians.reduce((sum, tech) => sum + tech.workload.validated, 0)} tone="green" />
        <StatCard icon={<AlertTriangle size={18} />} label="Corrections / refus" value={payload.technicians.reduce((sum, tech) => sum + tech.workload.corrections + tech.workload.rejected, 0)} tone="red" />
      </div>

      <Panel title="Équipe du laboratoire" subtitle="Techniciens visibles selon le laboratoire du responsable connecté.">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom ou matricule" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
          </div>
          <div className="text-sm text-slate-500">{filteredTechnicians.length} technicien(s) affiché(s)</div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Équipe</span>
            <select value={filters.team} onChange={(event) => setFilters((current) => ({ ...current, team: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="all">Toutes</option>
              {teamOptions.map((team) => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Disponibilité</span>
            <select value={filters.availability} onChange={(event) => setFilters((current) => ({ ...current, availability: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="all">Toutes</option>
              <option value="Disponible">Disponible</option>
              <option value="Chargé">Chargé</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Productivité</span>
            <select value={filters.productivity} onChange={(event) => setFilters((current) => ({ ...current, productivity: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="all">Toutes</option>
              <option value="Élevée">Élevée</option>
              <option value="Moyenne">Moyenne</option>
              <option value="Faible">Faible</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Période</span>
            <select value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="all">Toutes</option>
              <option value="day">Aujourd’hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
            </select>
          </label>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {loading ? (
            <p className="text-sm text-slate-500">Chargement...</p>
          ) : filteredTechnicians.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun technicien trouvé.</p>
          ) : filteredTechnicians.map((technician) => (
            <button key={technician.id} onClick={() => setSelectedTechnician(technician)} className={`rounded-xl border p-4 text-left transition ${selectedTechnician?.id === technician.id ? "border-slate-900 bg-slate-50 dark:border-slate-700 dark:bg-slate-900" : "border-slate-200 hover:border-slate-300 dark:border-slate-800"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{technician.fullName}</p>
                  <p className="mt-1 text-sm text-slate-500">{technician.matricule} • {technician.function}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase text-slate-700 dark:bg-slate-900 dark:text-slate-200">{technician.status}</span>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                <div>Laboratoire: {technician.laboratory}</div>
                <div>Équipe: {technician.team}</div>
                <div>Disponibilité: {technician.availability}</div>
                <div>Dernière activité: {formatDate(technician.lastActivityAt)}</div>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Panel title="Charge de travail" subtitle="Indicateurs calculés à partir des analyses réellement attribuées.">
            {selectedTechnician ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={<ClipboardList size={16} />} label="En attente" value={selectedTechnician.workload.pending} tone="amber" />
                <StatCard icon={<ShieldCheck size={16} />} label="En cours" value={selectedTechnician.workload.inProgress} tone="blue" />
                <StatCard icon={<TrendingUp size={16} />} label="Terminées" value={selectedTechnician.workload.completed} tone="green" />
                <StatCard icon={<AlertTriangle size={16} />} label="Corrections / refus" value={selectedTechnician.workload.corrections + selectedTechnician.workload.rejected} tone="red" />
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sélectionnez un technicien.</p>
            )}
          </Panel>

          <Panel title="Indicateurs de performance" subtitle="Temps de traitement, taux de validation et productivité hebdomadaire.">
            {selectedTechnician?.performance ? (
              <div className="grid gap-3 md:grid-cols-2">
                <StatCard icon={<TrendingUp size={16} />} label="Analyses traitées" value={selectedTechnician.performance.totalAnalyses} tone="blue" />
                <StatCard icon={<ShieldCheck size={16} />} label="Taux de validation" value={`${Math.round(selectedTechnician.performance.successRate * 100)}%`} tone="green" />
                <StatCard icon={<AlertTriangle size={16} />} label="Taux de refus" value={`${Math.round(selectedTechnician.performance.rejectionRate * 100)}%`} tone="red" />
                <StatCard icon={<ClipboardList size={16} />} label="Productivité sem." value={selectedTechnician.performance.weeklyProductivity} tone="amber" />
              </div>
            ) : (
              <p className="text-sm text-slate-500">Aucun indicateur disponible.</p>
            )}
            {selectedTechnician?.performance ? (
              <div className="mt-4 grid gap-3 text-sm text-slate-700 dark:text-slate-300 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white">Temps moyen de traitement</p>
                  <p className="mt-1">{selectedTechnician.performance.averageProcessingHours.toFixed(1)} h</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white">Temps d’attente avant analyse</p>
                  <p className="mt-1">{selectedTechnician.performance.averageReceptionToStartHours.toFixed(1)} h</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white">Taux de retard</p>
                  <p className="mt-1">{Math.round(selectedTechnician.performance.delayRate * 100)}%</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white">Niveau de productivité</p>
                  <p className="mt-1">{selectedTechnician.performance.productivityLevel}</p>
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="Attribution & réaffectation" subtitle="Affectation d’analyses au technicien sélectionné.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-2 block text-slate-700 dark:text-slate-300">Examen non attribué</span>
                <select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Sélectionner un examen</option>
                  {payload.unassignedItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.testName} • {item.patientName}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-2 block text-slate-700 dark:text-slate-300">Technicien cible</span>
                <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                  <option value="">Sélectionner un technicien</option>
                  {payload.technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>{tech.fullName}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-2 block text-slate-700 dark:text-slate-300">Motif / commentaire</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={assignItem} disabled={submitting || !selectedItemId || !technicianId} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                <ShieldCheck size={16} /> Attribuer
              </button>
              <button onClick={reassignItem} disabled={submitting || !selectedItemId || !technicianId} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                <ArrowRightLeft size={16} /> Réaffecter
              </button>
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Fiche détaillée" subtitle="Informations générales, charge actuelle et activité récente.">
            {selectedTechnician ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{selectedTechnician.fullName}</p>
                  <p className="mt-1 text-sm text-slate-500">{selectedTechnician.matricule} • {selectedTechnician.function}</p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Laboratoire: {selectedTechnician.laboratory}</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Équipe: {selectedTechnician.team}</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">Statut: {selectedTechnician.status}</p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Analyses assignées</h3>
                  <div className="mt-2 space-y-2">
                    {selectedTechnician.assignedItems.length === 0 ? (
                      <p className="text-sm text-slate-500">Aucune analyse assignée.</p>
                    ) : selectedTechnician.assignedItems.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-slate-900 dark:text-white">{item.testName}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] uppercase text-slate-700 dark:bg-slate-900 dark:text-slate-200">{item.status}</span>
                        </div>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">Patient: {item.patientName}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Historique chronologique</h3>
                  <div className="mt-2 space-y-2">
                    {(selectedTechnician.history || selectedTechnician.recentEvents || []).length === 0 ? (
                      <p className="text-sm text-slate-500">Aucune activité récente.</p>
                    ) : (selectedTechnician.history || selectedTechnician.recentEvents || []).map((event) => (
                      <div key={event.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                        <p className="font-medium text-slate-900 dark:text-white">{event.action}</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">{event.note || "-"}</p>
                        <p className="mt-1 text-xs text-slate-500">{event.patientName} • {event.testName} • {formatDate(event.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Traçabilité des refus / réaffectations</h3>
                  <div className="mt-2 space-y-2">
                    {((selectedTechnician.reassignments || []).length === 0 && (selectedTechnician.refusedValidations || []).length === 0) ? (
                      <p className="text-sm text-slate-500">Aucune trace disponible.</p>
                    ) : null}
                    {selectedTechnician.reassignments && selectedTechnician.reassignments.length > 0 ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/30 dark:bg-amber-950/20">
                        <p className="font-semibold text-amber-800 dark:text-amber-300">Réaffectations</p>
                        {selectedTechnician.reassignments.map((event) => (
                          <p key={event.id} className="mt-1 text-amber-700 dark:text-amber-200">{event.action} • {event.note || "Sans commentaire"}</p>
                        ))}
                      </div>
                    ) : null}
                    {selectedTechnician.refusedValidations && selectedTechnician.refusedValidations.length > 0 ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900/30 dark:bg-red-950/20">
                        <p className="font-semibold text-red-800 dark:text-red-300">Validations refusées</p>
                        {selectedTechnician.refusedValidations.map((item) => (
                          <p key={item.id} className="mt-1 text-red-700 dark:text-red-200">{item.patientName} • {item.testName} • {item.reason}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sélectionnez un technicien.</p>
            )}
          </Panel>
        </aside>
      </div>
    </AdminPageShell>
  );
}
