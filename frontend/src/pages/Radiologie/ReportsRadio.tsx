import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const stats = [
  { label: "Exams réalisés", value: "148" },
  { label: "Taux de validation", value: "94%" },
  { label: "Temps moyen de rendu", value: "22 min" },
];

export default function ReportsRadio() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Radiologie | Rapports" description="Rapports et analyses statistiques" />
      <PageBreadcrumb pageTitle="Rapports & Analyses Statistiques" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">Rapports & analyses statistiques</h1>
        <p className="mt-2 text-sm text-slate-300">Indicateurs de productivité, occupation et performance du service.</p>
      </section>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
