import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useTheme } from "../../context/ThemeContext";

type Priority = "High" | "Normal" | "Low";
type Status = "À faire" | "En cours" | "Terminé" | "En retard";

type TaskItem = {
  id: string;
  scheduledAt: string; // ISO
  patient: string;
  room: string;
  type: string;
  priority: Priority;
  status: Status;
  allergy?: string;
  note?: string;
};

const statusColor: Record<Status, string> = {
  "À faire": "bg-sky-100 text-sky-700",
  "En cours": "bg-amber-100 text-amber-700",
  "Terminé": "bg-emerald-100 text-emerald-700",
  "En retard": "bg-red-100 text-red-700",
};

const sampleTasks: TaskItem[] = [
  { id: "T-001", scheduledAt: new Date().toISOString(), patient: "Marie K.", room: "12B", type: "Injection antibiotique", priority: "High", status: "À faire", allergy: "Pénicilline", note: "Surveillance post-injection" },
  { id: "T-002", scheduledAt: new Date(Date.now() + 30 * 60000).toISOString(), patient: "Luc D.", room: "7A", type: "Contrôle tension", priority: "Normal", status: "À faire" },
  { id: "T-003", scheduledAt: new Date(Date.now() + 60 * 60000).toISOString(), patient: "Sophie N.", room: "15C", type: "Perfusion", priority: "High", status: "À faire" },
  { id: "T-004", scheduledAt: new Date(Date.now() - 25 * 60000).toISOString(), patient: "Paul M.", room: "3", type: "Visite post-op", priority: "Normal", status: "En cours" },
];

export default function Rounds() {
  const [tasks, setTasks] = useState<TaskItem[]>(sampleTasks);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [periodFilter, setPeriodFilter] = useState<"all" | "morning" | "afternoon" | "night" | "today" | "tomorrow">("today");
  const [query, setQuery] = useState("");

  // Counts / summary
  const summary = useMemo(() => {
    const totalPatients = new Set(tasks.map(t => t.patient)).size;
    const pending = tasks.filter(t => t.status !== "Terminé").length;
    const overdue = tasks.filter(t => t.status === "En retard").length;
    const urgencies = tasks.filter(t => t.priority === "High" && t.status !== "Terminé").length;
    return { totalPatients, pending, overdue, urgencies };
  }, [tasks]);

  // Helpers
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const inPeriod = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (periodFilter === "morning") return d.getHours() >= 6 && d.getHours() < 12;
    if (periodFilter === "afternoon") return d.getHours() >= 12 && d.getHours() < 18;
    if (periodFilter === "night") return d.getHours() >= 18 || d.getHours() < 6;
    if (periodFilter === "today") return startOf(d).getTime() === startOf(now).getTime();
    if (periodFilter === "tomorrow") return startOf(d).getTime() === startOf(new Date(now.getTime() + 24 * 3600 * 1000)).getTime();
    return true;
  };

  // Filtered and prioritized tasks (urgent first, then by status/time)
  const visibleTasks = useMemo(() => {
    return tasks
      .filter(t => inPeriod(t.scheduledAt))
      .filter(t => t.patient.toLowerCase().includes(query.toLowerCase()) || t.room.toLowerCase().includes(query.toLowerCase()) || t.type.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        const prio = { High: 0, Normal: 1, Low: 2 } as any;
        if (prio[a.priority] !== prio[b.priority]) return prio[a.priority] - prio[b.priority];
        const order = { "En retard": 0, "À faire": 1, "En cours": 2, "Terminé": 3 } as any;
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
  }, [tasks, periodFilter, query]);

  // Group by hour for timeline
  const timeline = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    visibleTasks.forEach(t => {
      const h = new Date(t.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(t);
    });
    return Array.from(map.entries());
  }, [visibleTasks]);

  // Action handlers
  const markDone = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'Terminé' } : t));
    if (selectedTask?.id === id) setSelectedTask(null);
  };

  const addObservation = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setSelectedTask(task);
    setObservationText("");
    setOpenObservationModal(true);
  };

  const reportProblem = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setSelectedTask(task);
    setProblemText("");
    setOpenProblemModal(true);
  };

  const submitObservation = () => {
    if (!selectedTask || !observationText) return;
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, note: (t.note ? t.note + '\n' : '') + observationText } : t));
    setOpenObservationModal(false);
    setObservationText("");
  };

  const submitProblem = (escalate = false) => {
    if (!selectedTask || !problemText) return;
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, note: (t.note ? t.note + '\n' : '') + problemText, status: 'En retard', priority: 'High' } : t));
    setOpenProblemModal(false);
    setProblemText("");
    if (escalate) window.alert('Problème escaladé au médecin (simulé)');
  };

  // Realtime / notifications stub: show upcoming tasks within 10 minutes
  const [notifications, setNotifications] = useState<string[]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      const soon = tasks.find(t => {
        const diff = new Date(t.scheduledAt).getTime() - Date.now();
        return diff > 0 && diff < 10 * 60 * 1000 && t.status !== 'Terminé';
      });
      if (soon) {
        setNotifications(n => {
          const msg = `${soon.type} — ${soon.patient} dans ${Math.ceil((new Date(soon.scheduledAt).getTime() - Date.now())/60000)} min`;
          if (n.includes(msg)) return n;
          return [msg, ...n].slice(0, 5);
        });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [tasks]);

  // Simulate remote update (placeholder) — in real app use socket/WS
  useEffect(() => {
    const id = setTimeout(() => {
      // example: doctor changed a note -> update first task
      setTasks(prev => prev.map((t, i) => i === 0 ? { ...t, note: (t.note || '') + '\nMise à jour: ordre médecin reçu.' } : t));
    }, 15000);
    return () => clearTimeout(id);
  }, []);

  // Theme
  const { theme, toggleTheme } = useTheme();

  // Observation / problem modals state
  const [openObservationModal, setOpenObservationModal] = useState(false);
  const [observationText, setObservationText] = useState("");
  const observationSuggestions = [
    "Patient stable",
    "Douleur modérée, administrer analgésique",
    "Site d'injection propre, pas de fuite",
    "Pâleur constatée, surveillance renforcée",
  ];

  const [openProblemModal, setOpenProblemModal] = useState(false);
  const [problemText, setProblemText] = useState("");
  const problemSuggestions = [
    "Difficulté d'accès veineux",
    "Réaction allergique suspectée",
    "Matériel manquant",
    "Patient instable — appel médecin requis",
  ];

  return (
    <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-950 min-h-screen">
      <PageMeta title="Tournées & horaires | D7 Clinique" description="Plan d'exécution clinique pour les tournées infirmières" />
      <PageBreadcrumb pageTitle="Tournées & horaires" />

      {/* Summary */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Patients à visiter</p>
          <p className="mt-2 text-2xl font-semibold">{summary.totalPatients}</p>
        </div>
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Tâches restantes</p>
          <p className="mt-2 text-2xl font-semibold">{summary.pending}</p>
        </div>
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Soins en retard</p>
          <p className="mt-2 text-2xl font-semibold text-red-600">{summary.overdue}</p>
        </div>
        <div className="rounded-3xl border bg-white p-4">
          <p className="text-xs text-slate-500">Urgences actives</p>
          <p className="mt-2 text-2xl font-semibold text-amber-700">{summary.urgencies}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        {/* Left: timeline */}
        <div>
          <div className="flex items-center gap-3">
            <input placeholder="Rechercher patient, chambre, soin" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 rounded-2xl border px-4 py-2" />
            <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as any)} className="rounded-2xl border px-3 py-2">
              <option value="morning">Matin</option>
              <option value="afternoon">Après-midi</option>
              <option value="night">Nuit</option>
              <option value="today">Aujourd'hui</option>
              <option value="tomorrow">Demain</option>
              <option value="all">Tous</option>
            </select>
            <button onClick={toggleTheme} className="rounded-2xl border px-3 py-2 text-sm">
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {timeline.length === 0 && <div className="rounded-2xl p-6 bg-white">Aucune tâche pour cette période.</div>}
            {timeline.map(([hour, items]) => (
              <div key={hour} className="rounded-2xl bg-white p-4 border">
                <div className="mb-2 text-sm text-slate-500 font-semibold">{hour}</div>
                <div className="space-y-2">
                  {items.map(item => (
                    <button key={item.id} onClick={() => setSelectedTask(item)} className="w-full flex items-center justify-between rounded-xl border px-3 py-2 hover:bg-slate-50">
                      <div className="text-left">
                        <div className="font-semibold">{item.patient} — {item.type}</div>
                        <div className="text-xs text-slate-500">Chambre {item.room}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusColor[item.status]}`}>{item.status}</span>
                        <span className={`text-xs px-2 py-1 rounded ${item.priority === 'High' ? 'bg-red-50 text-red-700' : item.priority === 'Normal' ? 'bg-slate-50 text-slate-800' : 'bg-slate-100 text-slate-700'}`}>{item.priority}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: detail pane */}
        <div>
          <div className="rounded-3xl border bg-white p-4 h-full">
            {!selectedTask && (
              <div className="text-slate-500">Sélectionnez une tâche pour voir les détails.</div>
            )}
            {selectedTask && (
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Patient</p>
                    <h3 className="mt-1 text-xl font-semibold">{selectedTask.patient}</h3>
                    <p className="text-sm text-slate-500">Chambre {selectedTask.room}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Heure</p>
                    <p className="font-semibold">{new Date(selectedTask.scheduledAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-semibold">Soin</p>
                  <p className="mt-1">{selectedTask.type}</p>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Allergie</p>
                    <p className="font-semibold">{selectedTask.allergy || 'Aucune renseignée'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Note médecin</p>
                    <p className="font-semibold">{selectedTask.note || '—'}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button onClick={() => markDone(selectedTask.id)} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">✔ Marquer effectué</button>
                  <button onClick={() => addObservation(selectedTask.id)} className="rounded-2xl border px-4 py-2 text-sm">📝 Ajouter observation</button>
                  <button onClick={() => reportProblem(selectedTask.id)} className="rounded-2xl border border-red-400 px-4 py-2 text-sm text-red-700">🚨 Signaler problème</button>
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="mt-4 rounded-3xl border bg-white p-4">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {notifications.length === 0 && <div className="text-slate-500">Aucune notification</div>}
              {notifications.map((n, i) => (
                <div key={i} className="rounded-lg bg-slate-50 p-2">{n}</div>
              ))}
            </div>
          </div>

          {/* Observation modal */}
          {openObservationModal && selectedTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
              <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Ajouter observation</p>
                    <h3 className="mt-1 text-lg font-semibold">{selectedTask.patient} — {selectedTask.type}</h3>
                  </div>
                  <button onClick={() => setOpenObservationModal(false)} className="rounded-2xl border px-3 py-2">Fermer</button>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {observationSuggestions.map(s => (
                      <button key={s} onClick={() => setObservationText(s)} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{s}</button>
                    ))}
                  </div>
                  <textarea value={observationText} onChange={(e) => setObservationText(e.target.value)} rows={4} className="w-full rounded-2xl border p-3" placeholder="Observation rapide..." />
                  <div className="flex gap-3">
                    <button onClick={submitObservation} className="flex-1 rounded-2xl bg-slate-900 px-4 py-2 text-white">Enregistrer</button>
                    <button onClick={() => setOpenObservationModal(false)} className="flex-1 rounded-2xl border px-4 py-2">Annuler</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Problem modal */}
          {openProblemModal && selectedTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
              <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs text-red-600">Signaler un problème</p>
                    <h3 className="mt-1 text-lg font-semibold">{selectedTask.patient} — {selectedTask.type}</h3>
                  </div>
                  <button onClick={() => setOpenProblemModal(false)} className="rounded-2xl border px-3 py-2">Fermer</button>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {problemSuggestions.map(s => (
                      <button key={s} onClick={() => setProblemText(s)} className="rounded-full bg-red-50 px-3 py-1 text-sm text-red-700">{s}</button>
                    ))}
                  </div>
                  <textarea value={problemText} onChange={(e) => setProblemText(e.target.value)} rows={4} className="w-full rounded-2xl border p-3" placeholder="Décrivez le problème..." />
                  <div className="flex gap-3">
                    <button onClick={() => submitProblem(true)} className="flex-1 rounded-2xl bg-red-700 px-4 py-2 text-white">Signaler & escalader</button>
                    <button onClick={() => submitProblem(false)} className="flex-1 rounded-2xl border px-4 py-2">Signaler sans escalade</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
