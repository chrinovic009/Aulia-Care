import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const queue = [
  { id: 1, patient: "M. Kabila", modality: "IRM", urgency: "Urgence", status: "Arrivé", room: "Salle 2", color: "bg-red-100 text-red-700" },
  { id: 2, patient: "Mme Mbuyi", modality: "Échographie", urgency: "Hospitalisé", status: "En examen", room: "Salle 5", color: "bg-amber-100 text-amber-700" },
  { id: 3, patient: "M. Bemba", modality: "Scanner", urgency: "Externe", status: "En attente", room: "Salle 3", color: "bg-blue-100 text-blue-700" },
];

export default function WaitingQueueRadio() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Radiologie | File d'attente" description="Suivi du flux patients en imagerie" />
      <PageBreadcrumb pageTitle="File d'attente & Flux Patients" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">File d’attente & flux patients</h1>
        <p className="mt-2 text-sm text-slate-300">Centralisation du flux de préparation, d’admission et de réalisation des examens.</p>
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {queue.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{item.patient}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.color}`}>{item.status}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Modalité : {item.modality}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Salle : {item.room}</p>
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">Priorité : {item.urgency}</p>
            <div className="mt-4 flex gap-2">
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">Appeler</button>
              <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">Modifier statut</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
