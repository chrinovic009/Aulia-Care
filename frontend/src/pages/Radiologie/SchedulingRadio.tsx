import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";
type Item = {
  id: string;
  status: string;
  scheduledAt?: string | null;
  urgency?: string | null;
  machine?: { name: string; roomNumber?: string | null } | null;
  patient: { firstName: string; lastName: string };
  imagingCatalogue?: { name: string } | null;
  bodyPart: string;
};
export default function SchedulingRadio() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiFetch<Item[]>("/imaging")
      .then(setItems)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Planning indisponible."),
      );
  }, []);
  const scheduled = useMemo(
    () =>
      items
        .filter((i) => i.scheduledAt)
        .sort(
          (a, b) =>
            new Date(a.scheduledAt!).getTime() -
            new Date(b.scheduledAt!).getTime(),
        ),
    [items],
  );
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta
        title="Radiologie | Planning"
        description="Agenda des examens radiologiques"
      />
      <PageBreadcrumb pageTitle="Planning & Agenda des Modalités" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">
          Planning & agenda des modalités
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Créneaux réellement programmés dans le RIS.
        </p>
      </section>
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="p-4">Date / heure</th>
              <th className="p-4">Équipement / salle</th>
              <th className="p-4">Patient</th>
              <th className="p-4">Examen</th>
              <th className="p-4">Priorité</th>
              <th className="p-4">Statut</th>
            </tr>
          </thead>
          <tbody>
            {scheduled.length ? (
              scheduled.map((i) => (
                <tr
                  key={i.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="p-4">
                    {new Date(i.scheduledAt!).toLocaleString("fr-FR")}
                  </td>
                  <td className="p-4">
                    {i.machine?.name || "À assigner"}
                    <span className="block text-xs text-slate-500">
                      {i.machine?.roomNumber || "Salle non assignée"}
                    </span>
                  </td>
                  <td className="p-4">
                    {i.patient.lastName} {i.patient.firstName}
                  </td>
                  <td className="p-4">
                    {i.imagingCatalogue?.name || i.bodyPart}
                  </td>
                  <td className="p-4">{i.urgency || "ROUTINE"}</td>
                  <td className="p-4">{i.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-4 text-slate-500" colSpan={6}>
                  Aucun examen programmé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
