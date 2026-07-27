import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const history = [
  { patient: "M. Kabange", exam: "IRM cervicale", date: "2026-07-22", result: "Validé" },
  { patient: "Mme Ilunga", exam: "Échographie abdominale", date: "2026-07-21", result: "Consultable" },
  { patient: "M. Lelo", exam: "Scanner thoracique", date: "2026-07-19", result: "À signer" },
];

export default function HistoryRadio() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Radiologie | Historique" description="Historique et dossiers d'imagerie" />
      <PageBreadcrumb pageTitle="Dossiers & Historique d'Imagerie" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">Dossiers & historique d’imagerie</h1>
        <p className="mt-2 text-sm text-slate-300">Recherche rapide d’un dossier patient et accès aux examens passés.</p>
      </section>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="p-4">Patient</th>
              <th className="p-4">Examen</th>
              <th className="p-4">Date</th>
              <th className="p-4">Statut</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={`${item.patient}-${item.date}`} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-4 font-medium">{item.patient}</td>
                <td className="p-4">{item.exam}</td>
                <td className="p-4">{item.date}</td>
                <td className="p-4">{item.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
