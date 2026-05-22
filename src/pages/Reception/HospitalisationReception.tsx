import { useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const hospitalisations = [
  {
    id: "HOS-2026-001",
    patient: "Grâce Ilunga",
    room: "A-204B",
    service: "Cardiologie",
    doctor: "Dr Mukendi",
    admissionDate: "16 Mai",
    status: "En soins",
    priority: "Stable",
  },
  {
    id: "HOS-2026-002",
    patient: "Patrick Sefu",
    room: "B-110A",
    service: "Chirurgie",
    doctor: "Dr Kabasele",
    admissionDate: "15 Mai",
    status: "Sortie prévue",
    priority: "Observation",
  },
  {
    id: "HOS-2026-003",
    patient: "Amina Mputu",
    room: "C-302",
    service: "Urgences",
    doctor: "Dr Ndala",
    admissionDate: "17 Mai",
    status: "Transfert prévu",
    priority: "Critique",
  },
  {
    id: "HOS-2026-004",
    patient: "Jean Kabila",
    room: "D-101",
    service: "Orthopédie",
    doctor: "Dr Mabiala",
    admissionDate: "14 Mai",
    status: "En soins",
    priority: "Stable",
  },
];

const roomInventory = [
  { room: "A-204", service: "Médecine interne", occupancy: "1/2", status: "Disponible" },
  { room: "B-110", service: "Chirurgie", occupancy: "2/2", status: "Complète" },
  { room: "C-302", service: "Urgences", occupancy: "1/1", status: "Réservation" },
  { room: "D-101", service: "Orthopédie", occupancy: "0/1", status: "Nettoyage" },
];

const alerts = [
  "Chambre non attribuée",
  "Dossier incomplet",
  "Assurance non validée",
  "Cas critique",
  "Autorisation manquante",
];

const statusStyles: Record<string, string> = {
  Stable: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Observation: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Critique: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "Transfert prévu": "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  "Sortie validée": "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
};

const roomStatusStyles: Record<string, string> = {
  Disponible: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Complète: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Nettoyage: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Réservation: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
};

const patientTimeline = [
  { date: "12 Mai", event: "Admission urgences" },
  { date: "13 Mai", event: "Affectation chambre B204" },
  { date: "14 Mai", event: "Scanner" },
  { date: "15 Mai", event: "Transfert cardiologie" },
  { date: "16 Mai", event: "Préparation sortie" },
];

export default function HospitalisationReception() {
  const [selectedHospitalisation, setSelectedHospitalisation] = useState<typeof hospitalisations[number] | null>(null);

  const stats = useMemo(
    () => ({
      hospitalized: 128,
      availableRooms: 23,
      capacityRate: 78,
      admissionsToday: 14,
      emergencyAdmissions: 5,
      plannedDischarges: 9,
    }),
    []
  );

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta
        title="Hospitalisations Réception | D7 Clinique"
        description="Gérez le flux administratif des hospitalisations depuis la réception."
      />
      <PageBreadcrumb pageTitle="Hospitalisations" />

      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Nouvelle hospitalisation", icon: "➕" },
            { label: "Rechercher un patient hospitalisé", icon: "🔍" },
            { label: "Voir chambres disponibles", icon: "🛏️" },
            { label: "Admission urgence", icon: "🚑" },
            { label: "Préparer sortie", icon: "📤" },
          ].map((action) => (
            <button
              key={action.label}
              className="rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <div className="mb-2 text-lg">{action.icon}</div>
              {action.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Patients hospitalisés</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats.hospitalized}</p>
            <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              +6 aujourd'hui
            </span>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Chambres disponibles</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats.availableRooms}</p>
            <span className="mt-3 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-200">
              Capacité {stats.capacityRate}%
            </span>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Admissions aujourd'hui</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats.admissionsToday}</p>
            <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Urgences : {stats.emergencyAdmissions}
            </span>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Sorties prévues</p>
            <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">{stats.plannedDischarges}</p>
            <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
              Avant 18h
            </span>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Flux hospitalisation</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Vue administrative des admissions, services et sorties.</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {hospitalisations.length} dossiers actifs
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-3 px-3">Patient</th>
                    <th className="py-3 px-3">Chambre</th>
                    <th className="py-3 px-3">Service</th>
                    <th className="py-3 px-3">Médecin</th>
                    <th className="py-3 px-3">Date admission</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {hospitalisations.map((item) => (
                    <tr key={item.id} className="border-b border-slate-200 dark:border-slate-700">
                      <td className="py-3 px-3 text-slate-900 dark:text-white">{item.patient}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.room}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.service}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.doctor}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{item.admissionDate}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.priority]}`}>{item.priority}</span>
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => setSelectedHospitalisation(item)}
                          className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Voir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Gestion des chambres</h4>
              <div className="mt-4 space-y-3">
                {roomInventory.map((room) => (
                  <div key={room.room} className="flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{room.room}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{room.service}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{room.occupancy}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${roomStatusStyles[room.status]}`}>{room.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Alertes importantes</h4>
              <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {alerts.map((alert) => (
                  <li key={alert} className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    {alert}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        {selectedHospitalisation && (
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Détails : {selectedHospitalisation.patient}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Coordination administrative et timeline de séjour.</p>
              </div>
              <button
                onClick={() => setSelectedHospitalisation(null)}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Fermer
              </button>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Chambre</p>
                    <p className="mt-2 font-semibold text-slate-900 dark:text-white">{selectedHospitalisation.room}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Service</p>
                    <p className="mt-2 font-semibold text-slate-900 dark:text-white">{selectedHospitalisation.service}</p>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Médecin référent</p>
                  <p className="mt-2 font-semibold text-slate-900 dark:text-white">{selectedHospitalisation.doctor}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Actions disponibles</p>
                  <div className="mt-3 grid gap-2">
                    {[
                      "Modifier chambre",
                      "Changer service",
                      "Ajouter accompagnant",
                      "Imprimer fiche hospitalisation",
                      "Préparer sortie",
                      "Voir facture",
                      "Contacter famille",
                    ].map((action) => (
                      <button key={action} className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <h4 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Timeline d'hospitalisation</h4>
                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  {patientTimeline.map((item) => (
                    <div key={item.date} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                      <p className="font-semibold text-slate-900 dark:text-white">{item.date}</p>
                      <p className="mt-1">{item.event}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
