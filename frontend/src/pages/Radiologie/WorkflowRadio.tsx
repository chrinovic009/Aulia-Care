import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const phases = [
  {
    title: "Phase prescription",
    items: [
      { patient: "Mme Lumu", exam: "Échographie abdominale", status: "À valider" },
      { patient: "M. Kalonji", exam: "Scanner thoracique", status: "À valider" },
    ],
  },
  {
    title: "Phase acquisition",
    items: [
      { patient: "M. Nzita", exam: "Radiographie pulmonaire", status: "En cours" },
      { patient: "Mme Banza", exam: "IRM cérébrale", status: "En cours" },
    ],
  },
  {
    title: "Phase compte-rendu",
    items: [
      { patient: "M. Tshisekedi", exam: "Scanner cervical", status: "Attente de signature" },
      { patient: "Mme Okende", exam: "Échographie obstétricale", status: "À rédiger" },
    ],
  },
];

export default function WorkflowRadio() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Radiologie | Workflow PACS" description="Flux de travail de prescription, acquisition et compte-rendu" />
      <PageBreadcrumb pageTitle="Workflow PACS / RIS" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">Workflow PACS / RIS</h1>
        <p className="mt-2 text-sm text-slate-300">Traçabilité complète du parcours d’un examen radiologique de la prescription à l’interprétation.</p>
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {phases.map((phase) => (
          <div key={phase.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{phase.title}</h2>
            <div className="mt-4 space-y-3">
              {phase.items.map((item) => (
                <div key={`${phase.title}-${item.patient}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{item.patient}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{item.exam}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-blue-600">{item.status}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
