import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const machines = [
  { name: "IRM 1.5T", room: "Salle IRM-01", status: "En service", tone: "bg-emerald-100 text-emerald-700" },
  { name: "Scanner 64 barrettes", room: "Salle CT-02", status: "Maintenance", tone: "bg-amber-100 text-amber-700" },
  { name: "Échographe 2", room: "Salle US-03", status: "En panne", tone: "bg-red-100 text-red-700" },
];

export default function EquipmentRadio() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Radiologie | Équipements" description="Suivi des équipements et maintenance" />
      <PageBreadcrumb pageTitle="Équipements & Maintenance" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">État et maintenance des équipements</h1>
        <p className="mt-2 text-sm text-slate-300">Supervision du parc radiologique, alertes et interventions biomédicales.</p>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {machines.map((machine) => (
          <div key={machine.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{machine.name}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${machine.tone}`}>{machine.status}</span>
            </div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{machine.room}</p>
            <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200">Dernier contrôle : 2h avant</p>
          </div>
        ))}
      </div>
    </div>
  );
}
