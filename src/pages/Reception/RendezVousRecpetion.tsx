import { useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

const initialRequests = [
  {
    id: "rv-001",
    patientName: "Sarah Ilunga",
    service: "Cardiologie",
    doctorRequested: "Dr Mukendi",
    dateRequested: "22 mai",
    status: "En attente",
    priority: "Normale",
    phone: "+243812345678",
    age: 34,
    dossier: "D-001234",
    lastVisits: "Consultation cardiologie il y a 3 semaines",
    motive: "Douleur thoracique depuis 3 jours",
    requestedOn: "2026-05-16",
  },
  {
    id: "rv-002",
    patientName: "Jean Kabila",
    service: "Laboratoire",
    doctorRequested: "Aucun médecin spécifique",
    dateRequested: "19 mai",
    status: "Confirmé",
    priority: "Normale",
    phone: "+243820112233",
    age: 44,
    dossier: "D-001235",
    lastVisits: "Prélèvement sanguin le 10 mai",
    motive: "Contrôle de bilan lipidique",
    requestedOn: "2026-05-15",
  },
  {
    id: "rv-003",
    patientName: "Amina Mputu",
    service: "Urgences",
    doctorRequested: "Aucun médecin spécifique",
    dateRequested: "Aujourd'hui",
    status: "Urgent",
    priority: "Urgent",
    phone: "+243817654321",
    age: 28,
    dossier: "D-001236",
    lastVisits: "Hospitalisation urgence il y a 1 semaine",
    motive: "Accident, douleur abdominale",
    requestedOn: "2026-05-17",
  },
  {
    id: "rv-004",
    patientName: "Driss Kone",
    service: "Pédiatrie",
    doctorRequested: "Dr Okapi",
    dateRequested: "21 mai",
    status: "Refusé",
    priority: "Normale",
    phone: "+243819876543",
    age: 8,
    dossier: "D-001237",
    lastVisits: "Vaccination le 02 mai",
    motive: "Fièvre persistante",
    requestedOn: "2026-05-15",
  },
];

const availabilityTimeline = [
  { time: "08:00", state: "Occupé" },
  { time: "09:00", state: "Disponible" },
  { time: "10:00", state: "Disponible" },
  { time: "11:00", state: "Consultation" },
  { time: "12:00", state: "Disponible" },
  { time: "13:00", state: "Occupé" },
];

const statusColor: Record<string, string> = {
  "En attente": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Confirmé: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Refusé: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Reprogrammé: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  Urgent: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
};

const priorityColor: Record<string, string> = {
  Normale: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  Prioritaire: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const scheduleColor: Record<string, string> = {
  Occupé: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Disponible: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Consultation: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
};

const aiTips = [
  "Le Dr Mukendi a déjà 18 consultations ce jour.",
  "Temps moyen d'attente cardiologie : 52 minutes.",
  "Le patient a déjà annulé 3 rendez-vous ce mois-ci.",
];

const emergencyQueue = [
  { name: "Amina Mputu", level: "Critique", wait: "12 min" },
  { name: "Sarah Ilunga", level: "Haute", wait: "25 min" },
  { name: "Nicolas Phiri", level: "Moyenne", wait: "40 min" },
];

const historyRecords = [
  { patient: "Sarah Ilunga", note: "Absence patient le 04 mai", when: "3 jours" },
  { patient: "Jean Kabila", note: "Annulé 2 rendez-vous ce mois-ci", when: "7 jours" },
  { patient: "Amina Mputu", note: "Retard 25 min" , when: "1 semaine"},
];

export default function RendezVousReception() {
  const [requests, setRequests] = useState(initialRequests);
  const [filter, setFilter] = useState<'day' | 'week' | 'month'>('week');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [reprogramDate, setReprogramDate] = useState("2026-05-20");
  const [reprogramTime, setReprogramTime] = useState("09:00");
  const [refusalReason, setRefusalReason] = useState("");

  const stats = useMemo(() => {
    return {
      total: requests.length,
      confirmed: requests.filter((item) => item.status === "Confirmé").length,
      pending: requests.filter((item) => item.status === "En attente").length,
      refused: requests.filter((item) => item.status === "Refusé" || item.status === "Reprogrammé").length,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const diffDays = (iso: string) => {
      const d = new Date(iso);
      return Math.round((d.getTime() - startOfToday.getTime()) / MS_PER_DAY);
    };

    if (filter === 'day') return requests.filter((r) => diffDays(r.requestedOn) === 0);
    if (filter === 'week') return requests.filter((r) => Math.abs(diffDays(r.requestedOn)) <= 7);
    if (filter === 'month') return requests.filter((r) => Math.abs(diffDays(r.requestedOn)) <= 30);
    return requests;
  }, [requests, filter]);

  const openRequest = (request: any) => {
    setSelectedRequest(request);
    setRefusalReason("");
    setReprogramDate(request.dateRequested === "Aujourd'hui" ? "2026-05-18" : "2026-05-20");
    setReprogramTime("09:00");
  };

  const closeRequest = () => setSelectedRequest(null);

  const updateRequest = (id: string, changes: any) => {
    setRequests((prev) => prev.map((request) => (request.id === id ? { ...request, ...changes } : request)));
  };

  const handleConfirm = () => {
    if (!selectedRequest) return;
    updateRequest(selectedRequest.id, { status: "Confirmé" });
    closeRequest();
  };

  const handleReprogram = () => {
    if (!selectedRequest) return;
    updateRequest(selectedRequest.id, {
      status: "Reprogrammé",
      dateRequested: `${reprogramDate} ${reprogramTime}`,
    });
    closeRequest();
  };

  const handleRefuse = () => {
    if (!selectedRequest) return;
    updateRequest(selectedRequest.id, { status: "Refusé" });
    closeRequest();
  };

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta
        title="Rendez-vous Réception | D7 Clinique"
        description="Tableau de bord de gestion des demandes de rendez-vous pour la réception."
      />
      <PageBreadcrumb pageTitle="Rendez-vous" />

      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-slate-900 shadow-sm dark:border-gray-800 dark:bg-slate-900 dark:text-white">
            <p className="text-sm font-medium">📅 Demandes aujourd'hui</p>
            <p className="mt-3 text-3xl font-semibold">{stats.total}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Demandes en file de gestion</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-slate-900 shadow-sm dark:border-gray-800 dark:bg-slate-900 dark:text-white">
            <p className="text-sm font-medium">🟢 Confirmés</p>
            <p className="mt-3 text-3xl font-semibold">{stats.confirmed}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Rendez-vous validés</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-slate-900 shadow-sm dark:border-gray-800 dark:bg-slate-900 dark:text-white">
            <p className="text-sm font-medium">🟡 En attente validation</p>
            <p className="mt-3 text-3xl font-semibold">{stats.pending}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Demandes à traiter</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 text-slate-900 shadow-sm dark:border-gray-800 dark:bg-slate-900 dark:text-white">
            <p className="text-sm font-medium">🔴 Refusés / reportés</p>
            <p className="mt-3 text-3xl font-semibold">{stats.refused}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Rendez-vous recalés</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Demandes de rendez-vous</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Le centre de gestion des demandes médicales de la réception.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setFilter('day')} aria-pressed={filter==='day'} className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter==='day' ? 'border border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900' : 'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                  Jour
                </button>
                <button onClick={() => setFilter('week')} aria-pressed={filter==='week'} className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter==='week' ? 'border border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900' : 'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                  Semaine
                </button>
                <button onClick={() => setFilter('month')} aria-pressed={filter==='month'} className={`rounded-full px-3 py-1 text-xs font-medium transition ${filter==='month' ? 'border border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900' : 'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                  Mois
                </button>
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="py-3 px-3">Patient</th>
                    <th className="py-3 px-3">Service</th>
                    <th className="py-3 px-3">Médecin demandé</th>
                    <th className="py-3 px-3">Date souhaitée</th>
                    <th className="py-3 px-3">Statut</th>
                    <th className="py-3 px-3">Priorité</th>
                    <th className="py-3 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="border-b border-slate-200 dark:border-slate-700">
                      <td className="py-3 px-3 text-slate-900 dark:text-white">{request.patientName}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{request.service}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{request.doctorRequested}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{request.dateRequested}</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[request.status]}`}>{request.status}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${priorityColor[request.priority]}`}>{request.priority}</span>
                      </td>
                      <td className="py-3 px-3">
                        <button onClick={() => openRequest(request)} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                          Voir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-4 md:hidden">
              {filteredRequests.map((request) => (
                <div key={request.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{request.patientName}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{request.service} • {request.dateRequested}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor[request.status]}`}>{request.status}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityColor[request.priority]}`}>{request.priority}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-white">Médecin demandé:</span> {request.doctorRequested}
                    </div>
                    <div>
                      <span className="font-medium text-slate-900 dark:text-white">Telephone:</span> {request.phone}
                    </div>
                  </div>
                  <button onClick={() => openRequest(request)} className="mt-4 inline-flex w-full justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
                    Voir
                  </button>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">IA assistance réception</h4>
              <ul className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {aiTips.map((tip) => (
                  <li key={tip} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Calendrier global</h4>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Jour</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Cardiologie • 12 rendez-vous</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Semaine</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Urgences & consultations</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Mois</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Médecins par service</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">File des urgences</h4>
              <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {emergencyQueue.map((item) => (
                  <div key={item.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="font-semibold text-slate-900 dark:text-white">{item.name}</div>
                    <div>{item.level}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Attente {item.wait}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Historique rendez-vous</h4>
              <ul className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {historyRecords.map((record) => (
                  <li key={`${record.patient}-${record.when}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="font-semibold text-slate-900 dark:text-white">{record.patient}</div>
                    <div>{record.note}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{record.when}</div>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-slate-900">
            <div className="max-h-[calc(100vh-3rem)] overflow-y-auto p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Détails de la demande</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gérer la demande avant confirmation, reprogrammation ou refus.</p>
              </div>
              <button onClick={closeRequest} className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-200">Fermer</button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="space-y-6">
                <div className="rounded-3xl border border-gray-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">Informations patient</h4>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white border border-gray-200 dark:border-slate-700">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Nom</div>
                      <div className="mt-1 font-semibold">{selectedRequest.patientName}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white border border-gray-200 dark:border-slate-700">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Téléphone</div>
                      <div className="mt-1 font-semibold">{selectedRequest.phone}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white border border-gray-200 dark:border-slate-700">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Âge</div>
                      <div className="mt-1 font-semibold">{selectedRequest.age} ans</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white border border-gray-200 dark:border-slate-700">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Dossier médical</div>
                      <div className="mt-1 font-semibold">{selectedRequest.dossier}</div>
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="text-sm text-slate-500 dark:text-slate-400">Dernières visites</div>
                    <div className="mt-2 rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white border border-gray-200 dark:border-slate-700">{selectedRequest.lastVisits}</div>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">Motif du rendez-vous</h4>
                  <p className="mt-3 text-slate-700 dark:text-slate-200">{selectedRequest.motive}</p>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">Choix médical</h4>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white border border-gray-200 dark:border-slate-700">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Service demandé</div>
                      <div className="mt-1 font-semibold">{selectedRequest.service}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white border border-gray-200 dark:border-slate-700">
                      <div className="text-sm text-slate-500 dark:text-slate-400">Médecin demandé</div>
                      <div className="mt-1 font-semibold">{selectedRequest.doctorRequested}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Si aucun médecin spécifique, la réception peut assigner automatiquement en fonction de la charge.</p>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">Disponibilité médecin</h4>
                  <div className="mt-4 grid gap-2">
                    {availabilityTimeline.map((slot) => (
                      <div key={slot.time} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                        <span className="font-medium text-slate-900 dark:text-white">{slot.time}</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${scheduleColor[slot.state]}`}>{slot.state}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-gray-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">Actions réceptionniste</h4>
                  <div className="mt-4 space-y-3">
                    <button onClick={handleConfirm} className="w-full rounded-2xl bg-emerald-900 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">✅ Confirmer</button>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">🔄 Reprogrammer</p>
                      <div className="mt-4 space-y-3">
                        <input type="date" value={reprogramDate} onChange={(e) => setReprogramDate(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                        <input type="time" value={reprogramTime} onChange={(e) => setReprogramTime(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                        <button onClick={handleReprogram} className="w-full rounded-2xl bg-sky-900 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-800">Reprogrammer</button>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">❌ Refuser</p>
                      <textarea placeholder="Motif de refus" value={refusalReason} onChange={(e) => setRefusalReason(e.target.value)} className="mt-3 h-24 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                      <button onClick={handleRefuse} className="mt-3 w-full rounded-2xl bg-red-900 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800">Refuser</button>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white">Informations de contrôle</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Ce centre vérifie les disponibilités, équilibre la charge et priorise les urgences avant attribution.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
