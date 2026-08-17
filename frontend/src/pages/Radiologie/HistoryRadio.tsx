import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";
type Item = {
  id: string;
  createdAt: string;
  status: string;
  modality: string;
  bodyPart: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    externalId?: string | null;
  };
  imagingCatalogue?: { name: string } | null;
  report?: { verified: boolean; impression: string } | null;
};
export default function HistoryRadio() {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiFetch<Item[]>("/imaging")
      .then(setItems)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Historique indisponible."),
      );
  }, []);
  const history = useMemo(
    () =>
      items.filter((i) =>
        `${i.patient.lastName} ${i.patient.firstName} ${i.patient.externalId || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [items, query],
  );
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta
        title="Radiologie | Historique"
        description="Dossiers d'imagerie issus de la base"
      />
      <PageBreadcrumb pageTitle="Dossiers & Historique d'Imagerie" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">
          Dossiers & historique d’imagerie
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Vision longitudinale des demandes et comptes rendus réellement
          enregistrés.
        </p>
      </section>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mt-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        placeholder="Nom, identifiant hospitalier"
      />
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="p-4">Patient</th>
              <th className="p-4">Examen</th>
              <th className="p-4">Date</th>
              <th className="p-4">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {history.length ? (
              history.map((i) => (
                <tr
                  key={i.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="p-4 font-medium">
                    {i.patient.lastName} {i.patient.firstName}
                    <span className="block text-xs text-slate-500">
                      {i.patient.externalId || i.patient.id}
                    </span>
                  </td>
                  <td className="p-4">
                    {i.imagingCatalogue?.name || i.bodyPart}
                    <span className="block text-xs text-slate-500">
                      {i.modality}
                    </span>
                  </td>
                  <td className="p-4">
                    {new Date(i.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="p-4">
                    {i.report?.verified
                      ? "Rapport validé"
                      : i.report
                        ? "Brouillon / à valider"
                        : i.status}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="p-4 text-slate-500" colSpan={4}>
                  Aucun dossier trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
