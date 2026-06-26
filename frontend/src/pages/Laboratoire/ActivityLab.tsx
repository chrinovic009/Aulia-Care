import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Beaker, ClipboardList, Layers, Users } from "lucide-react";
import { AdminPageShell, Panel, StatCard, DataTable, formatDate } from "../Administration/adminUi";
import { fetchLaboratoryActivity, LabActivityPayload } from "../../api/laboratory";

export default function ActivityLab() {
  const [activity, setActivity] = useState<LabActivityPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadActivity = async () => {
    setIsLoading(true);
    try {
      const data = await fetchLaboratoryActivity();
      setActivity(data);
    } catch (error) {
      console.error("Impossible de charger l'activité laboratoire", error);
      setActivity(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadActivity();

    const handler = () => {
      loadActivity();
    };
    window.addEventListener("d7:lab.request.created", handler);
    window.addEventListener("d7:lab.result.created", handler);
    return () => {
      window.removeEventListener("d7:lab.request.created", handler);
      window.removeEventListener("d7:lab.result.created", handler);
    };
  }, []);

  return (
    <AdminPageShell
      title="Activité Laboratoire"
      subtitle="Vue opérationnelle en temps réel basée sur les demandes, les échantillons et le personnel de laboratoire."
      actions={
        <button
          onClick={loadActivity}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Chargement...' : 'Actualiser'}
        </button>
      }
    >
      <section className="grid gap-4 xl:grid-cols-3">
        <StatCard icon={<ClipboardList size={20} />} label="Demandes totales" value={activity?.totalRequests ?? "–"} tone="blue" />
        <StatCard icon={<Beaker size={20} />} label="Demandes en attente" value={activity?.pendingRequests ?? "–"} tone="amber" />
        <StatCard icon={<Users size={20} />} label="Analyse en validation" value={activity?.validationQueueCount ?? "–"} tone="red" />
        <StatCard icon={<Activity size={20} />} label="Technique validées" value={activity?.technicalValidationCount ?? "–"} tone="green" />
        <StatCard icon={<Layers size={20} />} label="Biologique validées" value={activity?.biologicalValidationCount ?? "–"} tone="green" />
        <StatCard icon={<AlertTriangle size={20} />} label="Échantillons reçus" value={activity?.sampleReceivedCount ?? "–"} tone="slate" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Panel title="Demandes récentes" subtitle="20 dernières demandes de laboratoire les plus récentes.">
            <DataTable
              headers={["ID", "Patient", "Statut", "Priorité", "Examen", "Assigné à", "Demandé le"]}
              rows={activity?.recentRequests.map((request) => [
                request.id,
                request.patientName,
                request.status,
                request.priority,
                request.specimenType,
                request.assignedTo || "Non assigné",
                formatDate(request.requestedAt),
              ]) ?? []}
            />
          </Panel>

          <Panel title="Travail technicien" subtitle="Charge de travail par technicien sur demandes ouvertes.">
            <div className="space-y-3">
              {(activity?.technicianWorkloads.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">Aucune charge de travail disponible.</p>
              ) : (
                activity?.technicianWorkloads.slice(0, 6).map((workload, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{workload.technician}</p>
                        <p className="text-xs text-slate-500">Demandes assignées: {workload.assignedItems}</p>
                      </div>
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Ouvertes: {workload.openItems}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Alertes lab" subtitle="Points d'attention immédiats pour le laboratoire.">
            {activity?.lowStockAlerts.length === 0 && activity?.criticalAlerts.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune alerte détectée.</p>
            ) : (
              <div className="space-y-4">
                {activity?.criticalAlerts.slice(0, 4).map((alert, index) => (
                  <div key={`critical-${index}`} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/20">
                    <p className="font-semibold">{alert.title}</p>
                    <p className="mt-1">{alert.message}</p>
                    <p className="mt-1 text-xs text-slate-600">{formatDate(alert.createdAt)}</p>
                  </div>
                ))}
                {activity?.lowStockAlerts.slice(0, 4).map((alert, index) => (
                  <div key={`stock-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <p className="font-semibold">Stock critique: {alert.consumableName}</p>
                    <p className="mt-1">Quantité: {alert.quantity} — Seuil min: {alert.minimumLevel ?? 'N/A'}</p>
                    <p className="mt-1 text-xs text-slate-600">Localisation: {alert.location}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Flux d'échantillons" subtitle="Surveillance simple des prélèvements et réceptions.">
            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm text-slate-500">Échantillons collectés</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{activity?.sampleCollectedCount ?? "–"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm text-slate-500">Échantillons reçus</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{activity?.sampleReceivedCount ?? "–"}</p>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </AdminPageShell>
  );
}
