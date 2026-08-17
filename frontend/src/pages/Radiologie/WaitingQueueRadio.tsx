import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

type RequestItem = {
  id: string;
  accessionNumber?: string | null;
  status: string;
  urgency?: string | null;
  modality: string;
  bodyPart: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    externalId?: string | null;
  };
  requestedBy?: { displayName: string } | null;
  machine?: { name: string; roomNumber?: string | null } | null;
  imagingCatalogue?: { name: string } | null;
};
const activeStatuses = ["REQUESTED", "SCHEDULED", "IN_PROGRESS"];
const labels: Record<string, string> = {
  REQUESTED: "Demandé",
  SCHEDULED: "Programmé",
  IN_PROGRESS: "Examen en cours",
  COMPLETED: "À interpréter",
  VERIFIED: "Résultat disponible",
  CANCELLED: "Annulé",
};

export default function WaitingQueueRadio() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ACTIVE");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setItems(await apiFetch<RequestItem[]>("/imaging"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === "ACTIVE"
            ? activeStatuses.includes(item.status)
            : filter === "ALL" || item.status === filter) &&
          `${item.patient.lastName} ${item.patient.firstName} ${item.patient.externalId || ""} ${item.accessionNumber || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [items, filter, query],
  );
  const updateStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/imaging/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mise à jour impossible.");
    }
  };
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta
        title="Radiologie | File d'attente"
        description="Worklist radiologique en temps réel"
      />
      <PageBreadcrumb pageTitle="File d'attente & Flux Patients" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">File d’attente radiologique</h1>
        <p className="mt-2 text-sm text-slate-300">
          Worklist RIS : seules les demandes enregistrées sont affichées.
        </p>
      </section>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Patient, ID, accession number"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="ACTIVE">File active</option>
          <option value="ALL">Tous les statuts</option>
          <option value="COMPLETED">À interpréter</option>
          <option value="VERIFIED">Résultats disponibles</option>
        </select>
        <button
          onClick={() => void load()}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Actualiser
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="p-3">Patient</th>
              <th className="p-3">Examen</th>
              <th className="p-3">Modalité</th>
              <th className="p-3">Priorité</th>
              <th className="p-3">Salle</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4" colSpan={7}>
                  Chargement…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td className="p-4" colSpan={7}>
                  Aucune demande ne correspond aux filtres.
                </td>
              </tr>
            ) : (
              visible.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="p-3 font-medium">
                    {item.patient.lastName} {item.patient.firstName}
                    <span className="block text-xs text-slate-500">
                      {item.patient.externalId || item.patient.id}
                    </span>
                  </td>
                  <td className="p-3">
                    {item.imagingCatalogue?.name || item.bodyPart}
                    <span className="block text-xs text-slate-500">
                      {item.accessionNumber || "Accession à attribuer"}
                    </span>
                  </td>
                  <td className="p-3">{item.modality}</td>
                  <td className="p-3">{item.urgency || "ROUTINE"}</td>
                  <td className="p-3">
                    {item.machine?.roomNumber ||
                      item.machine?.name ||
                      "Non assignée"}
                  </td>
                  <td className="p-3">{labels[item.status] || item.status}</td>
                  <td className="p-3">
                    <select
                      aria-label="Changer le statut"
                      value={item.status}
                      onChange={(e) =>
                        void updateStatus(item.id, e.target.value)
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:bg-slate-950"
                    >
                      <option value="REQUESTED">Demandé</option>
                      <option value="SCHEDULED">Programmé</option>
                      <option value="IN_PROGRESS">Examen en cours</option>
                      <option value="COMPLETED">Images acquises</option>
                      <option value="CANCELLED">Annuler</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
