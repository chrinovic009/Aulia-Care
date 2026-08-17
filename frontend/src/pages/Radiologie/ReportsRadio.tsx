import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";
type Overview = {
  metrics: {
    totalScheduled: number;
    realized: number;
    pending: number;
    averageWaitMinutes: number;
    averageDurationMinutes: number;
    occupancyRate: number;
  };
  modalityBreakdown: { modality: string; count: number; percentage: number }[];
  workflowAlerts: {
    id: string;
    patientName: string;
    waitingMinutes: number;
    severity: string;
  }[];
};
export default function ReportsRadio() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiFetch<Overview>(
      "/imaging/dashboard/overview?period=MONTH&modality=ALL&service=ALL",
    )
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Analyses indisponibles."),
      );
  }, []);
  const cards = data
    ? [
        { l: "Examens du mois", v: data.metrics.totalScheduled },
        { l: "Examens réalisés", v: data.metrics.realized },
        { l: "En attente", v: data.metrics.pending },
        { l: "Attente moyenne", v: `${data.metrics.averageWaitMinutes} min` },
        { l: "Durée moyenne", v: `${data.metrics.averageDurationMinutes} min` },
        { l: "Occupation", v: `${data.metrics.occupancyRate}%` },
      ]
    : [];
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta
        title="Radiologie | Rapports"
        description="Indicateurs réels du service radiologie"
      />
      <PageBreadcrumb pageTitle="Rapports & Analyses Statistiques" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">Rapports & analyses</h1>
        <p className="mt-2 text-sm text-slate-300">
          Indicateurs calculés depuis les demandes, réalisations et rapports du
          mois.
        </p>
      </section>
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.l}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-sm text-slate-500">{c.l}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {c.v}
            </p>
          </div>
        ))}
      </div>
      {data && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900">
            <h2 className="font-semibold">Activité par modalité</h2>
            {data.modalityBreakdown.map((m) => (
              <p key={m.modality} className="mt-3 flex justify-between text-sm">
                <span>{m.modality}</span>
                <span>
                  {m.count} · {m.percentage}%
                </span>
              </p>
            )) || <p>Aucune donnée.</p>}
          </section>
          <section className="rounded-xl bg-white p-5 shadow-sm dark:bg-slate-900">
            <h2 className="font-semibold">Alertes SLA / interprétation</h2>
            {data.workflowAlerts.length ? (
              data.workflowAlerts.map((a) => (
                <p key={a.id} className="mt-3 text-sm">
                  {a.patientName} · {a.severity} · {a.waitingMinutes} min
                </p>
              ))
            ) : (
              <p className="mt-3 text-sm text-slate-500">Aucune alerte.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
