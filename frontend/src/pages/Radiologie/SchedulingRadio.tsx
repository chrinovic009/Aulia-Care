import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const slots = [
  { time: "08:00", machine: "IRM 1.5T", patient: "M. Dodo", status: "Confirmé" },
  { time: "09:30", machine: "Scanner 64", patient: "Mme Mputu", status: "Urgence" },
  { time: "11:00", machine: "Échographe 2", patient: "M. Nsio", status: "Maintenance" },
];

export default function SchedulingRadio() {
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Radiologie | Planning" description="Planning des modalités et créneaux" />
      <PageBreadcrumb pageTitle="Planning & Agenda des Modalités" />
      <section className="rounded-xl bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-semibold">Planning & agenda des modalités</h1>
        <p className="mt-2 text-sm text-slate-300">Vue calendrier des réservations par salle et machine d’imagerie.</p>
      </section>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="p-4">Heure</th>
              <th className="p-4">Machine</th>
              <th className="p-4">Patient</th>
              <th className="p-4">Statut</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={slot.time} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-4 font-medium">{slot.time}</td>
                <td className="p-4">{slot.machine}</td>
                <td className="p-4">{slot.patient}</td>
                <td className="p-4">{slot.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
