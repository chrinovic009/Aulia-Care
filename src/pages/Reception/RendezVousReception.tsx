import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";

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
  "Synthèse clinique: charge actuelle élevée pour certains services; prioriser les cas urgents.",
  "Temps d'attente moyen (Cardiologie) estimé: ~52 minutes — ajuster les créneaux si nécessaire.",
  "Historique de non-présentation: vérifier les patients à risque d'absentéisme récurrent.",
];

// Note: emergency queue and history are computed from PostgreSQL-driven requests

type ReceptionRequest = {
  id: string;
  patientName: string;
  service: string;
  doctorRequested: string;
  dateRequested: string;
  status: string;
  priority: string;
  phone: string;
  age: number;
  dossier: string;
  lastVisits: string;
  motive: string;
  requestedOn: string;
  [key: string]: any;
};

export default function RendezVousReception() {
  const [requests, setRequests] = useState<ReceptionRequest[]>([]);
  const [filter, setFilter] = useState<'day' | 'week' | 'month'>('week');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [reprogramDate, setReprogramDate] = useState("2026-05-20");
  const [reprogramTime, setReprogramTime] = useState("09:00");
  const [refusalReason, setRefusalReason] = useState("");
  const [loading, setLoading] = useState(true);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  const [patients, setPatients] = useState<any[]>([]);
  const [physicians, setPhysicians] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // Load appointments, patients and physicians from backend (PostgreSQL)
        const [appsRes, patsRes, docsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/appointments`, { credentials: "include" }),
          fetch(`${API_BASE_URL}/patients`, { credentials: "include" }),
          fetch(`${API_BASE_URL}/users?role=PHYSICIAN`, { credentials: "include" }),
        ]);

        const apps = appsRes.ok ? await appsRes.json() : [];
        const pats = patsRes.ok ? await patsRes.json() : [];
        const docs = docsRes.ok ? await docsRes.json() : [];

        setRequests(Array.isArray(apps) ? apps : []);
        setPatients(Array.isArray(pats) ? pats : []);
        setPhysicians(Array.isArray(docs) ? docs : []);
      } catch (e) {
        console.error("Error loading reception data:", e);
        setRequests([]);
        setPatients([]);
        setPhysicians([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    // total = patients with PatientWorkflowStatus EN_ATTENTE_INFIRMERIE or EN_ATTENTE_MEDECIN
    const total = patients.filter((p: any) => {
      const s = (p.patientWorkflowStatus || p.workflowStatus || p.status || "").toString().toUpperCase();
      return s === "EN_ATTENTE_INFIRMERIE" || s === "EN_ATTENTE_MEDECIN";
    }).length;

    const confirmed = requests.filter((item) => {
      const s = (item.appointmentStatus || item.status || "").toString().toUpperCase();
      return s === "CONFIRMED" || s === "CONFIRME" || s === "CONFIRMÉ" || s === "CONFIRMÉE";
    }).length;

    const pending = requests.filter((item) => {
      const s = (item.appointmentStatus || item.status || "").toString().toUpperCase();
      return s === "CHECKED_IN" || s === "CHECKEDIN" || s === "CHECKED-IN" || s === "EN_ATTENTE";
    }).length;

    const refused = requests.filter((item) => {
      const s = (item.appointmentStatus || item.status || "").toString().toUpperCase();
      return s === "CANCELLED" || s === "CANCELÉ" || s === "REFUSÉ" || s === "REFUSE";
    }).length;

    return { total, confirmed, pending, refused };
  }, [patients, requests]);

  const filteredRequests = useMemo(() => {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const getIso = (r: any) => r.requestedOn || r.dateRequested || r.scheduledAt || r.startDate || r.date;

    const diffDays = (iso?: string) => {
      if (!iso) return 9999;
      const d = new Date(iso);
      return Math.round((d.getTime() - startOfToday.getTime()) / MS_PER_DAY);
    };

    if (filter === 'day') return requests.filter((r) => diffDays(getIso(r)) === 0);
    if (filter === 'week') return requests.filter((r) => {
      const d = diffDays(getIso(r));
      return d >= 0 && d <= 7;
    });
    if (filter === 'month') return requests.filter((r) => {
      const d = diffDays(getIso(r));
      return d >= 0 && d <= 30;
    });
    if (filter === 'nextMonth') return requests.filter((r) => {
      const d = diffDays(getIso(r));
      return d > 30 && d <= 62; // approx next month
    });
    if (filter === 'past') return requests.filter((r) => diffDays(getIso(r)) < 0);

    return requests;
  }, [requests, filter]);

  // Derived metrics for the aside
  const todayRequests = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return requests.filter((r) => {
      const iso = r.requestedOn || r.dateRequested || r.scheduledAt || r.startDate || r.date;
      if (!iso) return false;
      const d = new Date(iso);
      return d >= start && d < end;
    });
  }, [requests]);

  const mostBookedServiceToday = useMemo(() => {
    const map: Record<string, number> = {};
    todayRequests.forEach((r) => { map[r.service || '—'] = (map[r.service || '—'] || 0) + 1; });
    const entries = Object.entries(map);
    if (entries.length === 0) return { service: '—', count: 0 };
    const max = entries.sort((a, b) => b[1] - a[1])[0];
    return { service: max[0], count: max[1] };
  }, [todayRequests]);

  const nextUpcoming = useMemo(() => {
    const now = new Date();
    const future = requests
      .map((r) => ({ r, iso: new Date(r.requestedOn || r.dateRequested || r.scheduledAt || r.startDate || r.date || null) }))
      .filter((x) => x.iso && x.iso > now)
      .sort((a, b) => a.iso.getTime() - b.iso.getTime());
    if (!future.length) return null;
    return { ...future[0].r, time: future[0].iso };
  }, [requests]);

  const cancelledOrMissed = useMemo(() => {
    const now = new Date();
    return requests.filter((r) => {
      const s = (r.appointmentStatus || r.status || '').toString().toUpperCase();
      const iso = r.requestedOn || r.dateRequested || r.scheduledAt || r.startDate || r.date;
      if (s === 'CANCELLED' || s === 'CANCELÉ' || s === 'REFUSE' || s === 'REFUSÉ') return true;
      if (iso) {
        const d = new Date(iso);
        if (d < now && !(s === 'CONFIRMED' || s === 'CONFIRME' || s === 'CONFIRMÉ')) return true; // missed
      }
      return false;
    }).slice(0, 50);
  }, [requests]);

  const emergencyQueueToday = useMemo(() => {
    return requests.filter((r) => {
      const priority = (r.priority || '').toString().toUpperCase();
      const iso = r.requestedOn || r.dateRequested || r.scheduledAt || r.startDate || r.date;
      if (!iso) return false;
      const d = new Date(iso);
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(start.getTime() + 24*60*60*1000);
      return (priority === 'URGENT' || priority.includes('URG')) && d >= start && d < end;
    }).slice(0, 20);
  }, [requests]);

  const historyList = useMemo(() => {
    return requests
      .slice()
      .sort((a, b) => {
        const da = new Date(a.requestedOn || a.dateRequested || a.scheduledAt || a.startDate || a.date || 0).getTime();
        const db = new Date(b.requestedOn || b.dateRequested || b.scheduledAt || b.startDate || b.date || 0).getTime();
        return db - da;
      })
      .slice(0, 15);
  }, [requests]);

  const lastWeekEmergencies = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return requests.filter((r) => {
      const p = (r.priority || '').toString().toUpperCase();
      const iso = r.requestedOn || r.dateRequested || r.scheduledAt || r.startDate || r.date;
      if (!iso) return false;
      const d = new Date(iso);
      return p === 'URGENT' && d >= weekAgo && d <= now;
    }).length;
  }, [requests]);

  const doctorsFreeThisMonth = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth()+1, 1);
    const busy: Record<string, boolean> = {};
    requests.forEach((r) => {
      const iso = r.requestedOn || r.dateRequested || r.scheduledAt || r.startDate || r.date;
      if (!iso) return;
      const d = new Date(iso);
      if (d >= start && d < end && r.doctorRequested) busy[r.doctorRequested] = true;
    });
    return physicians.filter((doc) => !busy[doc.displayName || doc.username]).slice(0, 8);
  }, [requests, physicians]);

  const openRequest = (request: ReceptionRequest) => {
    setSelectedRequest(request);
    setRefusalReason("");
    setReprogramDate(request.dateRequested === "Aujourd'hui" ? "2026-05-18" : "2026-05-20");
    setReprogramTime("09:00");
  };

  const closeRequest = () => setSelectedRequest(null);

  const updateRequest = async (id: string, changes: any) => {
    try {
      const url = `${API_BASE_URL}/appointments/${id}`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(changes),
      });
      if (response.ok) {
        const updated = await response.json();
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      }
    } catch (e) {
      console.error("Error updating request:", e);
    }
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

  if (loading) {
    return (
      <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
        <PageBreadcrumb pageTitle="Rendez-vous" />
        <div className="flex items-center justify-center py-12">
          <p className="text-slate-600 dark:text-slate-400">Chargement des rendez-vous...</p>
        </div>
      </div>
    );
  }

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
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{mostBookedServiceToday.service} • {mostBookedServiceToday.count} rendez-vous</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Semaine</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Urgences cette semaine passée • {lastWeekEmergencies} cas</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Mois</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">Médecins sans rendez-vous ce mois • {doctorsFreeThisMonth.length}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Annulés / non respectés: {cancelledOrMissed.length}</p>
                </div>
              </div>
            </div>

            {nextUpcoming && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
                <h4 className="text-base font-semibold text-slate-900 dark:text-white">Prochain rendez-vous</h4>
                <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  <div className="font-medium text-slate-900 dark:text-white">{(nextUpcoming as any).patientName || (nextUpcoming as any).patient || (nextUpcoming as any).displayName || '—'}</div>
                  <div className="text-xs">{new Date((nextUpcoming as any).time).toLocaleString()} • {(nextUpcoming as any).service || '—'}</div>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">File des urgences</h4>
              <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    {emergencyQueueToday.map((e) => (
                      <div key={e.id || e._id || `${e.patient}-${e.scheduledAt}`} className="flex items-center gap-3 py-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white shadow-sm">
                          <div className="h-8 w-8 rounded-full bg-rose-200 text-rose-800 flex items-center justify-center">!</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <div className="truncate">
                              <div className="text-sm font-medium text-slate-900 dark:text-white">{e.patientName || e.patient || e.patientDisplay || e.displayName || '—'}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{e.service || e.department || '—'}</div>
                            </div>
                            <div className="ml-2 flex-shrink-0 text-xs text-rose-600">{(e.priority || 'Urgent').toString()}</div>
                          </div>
                        </div>
                      </div>
                    ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-slate-900">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">Historique rendez-vous</h4>
              <ul className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                {historyList.map((h) => (
                  <li key={h.id || h._id || `${h.patient}-${h.requestedOn}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="font-semibold text-slate-900 dark:text-white">{h.patientName || h.patient || h.displayName || '—'}</div>
                    <div>{h.service || h.appointmentType || h.note || '—'}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(h.requestedOn || h.dateRequested || h.scheduledAt || h.startDate || h.date || 0).toLocaleString()}</div>
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
