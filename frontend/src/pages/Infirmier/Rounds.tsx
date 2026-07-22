import { useEffect, useMemo, useRef, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useTheme } from "../../context/ThemeContext";
import { apiFetch } from "../../config/api";
import {
  fetchNurseRounds,
  recordNurseRound,
} from "../../api/nurse";

type Priority = "High" | "Normal" | "Low";
type Status = "À faire" | "En cours" | "Terminé" | "En retard";

type TaskItem = {
  id: string;
  hospitalizationId?: string;
  patientId?: string;
  scheduledAt: string; // ISO
  patient: string;
  room: string;
  type: string;
  priority: Priority;
  status: Status;
  allergy?: string;
  note?: string;
  service?: string;
  lastUpdated?: string;
  access?: { canWrite: boolean; mode: string; reason: string };
};

const statusColor: Record<Status, string> = {
  "À faire": "bg-sky-100 text-sky-700",
  "En cours": "bg-amber-100 text-amber-700",
  "Terminé": "bg-emerald-100 text-emerald-700",
  "En retard": "bg-red-100 text-red-700",
};

const getTaskStatus = (patient: any): Status => {
  const now = new Date();
  const scheduled = new Date(patient.arrivalAt || patient.createdAt);
  const diffMinutes = (now.getTime() - scheduled.getTime()) / 60000;
  if (patient.status === "Termine") return "TerminÃ©";
  if (patient.status === "En retard") return "En retard";
  if (patient.status === "En cours") return "En cours";
  if (patient.status === "A faire") return "Ã€ faire";
  if (patient.workflowStatus !== "EN_ATTENTE_INFIRMERIE") {
    return "En cours";
  }
  if (diffMinutes > 45) return "En retard";
  return "À faire";
};

const formatRoundNote = (value?: string | null) => {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return [parsed.observation, parsed.problem, parsed.accessReason].filter(Boolean).join("\n");
  } catch {
    return value;
  }
};

const mapPatientToTask = (patient: any): TaskItem => ({
  id: patient.id,
  hospitalizationId: patient.hospitalizationId || patient.id,
  patientId: patient.patientId,
  scheduledAt: patient.scheduledAt || patient.arrivalAt || patient.createdAt || new Date().toISOString(),
  patient: patient.patient || [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ") || "Patient",
  room: patient.service || "—",
  type: patient.workflowStatus === "EN_ATTENTE_INFIRMERIE" ? "Prise de signes vitaux" : "Suivi infirmier",
  priority: patient.priority === "High" ? "High" : "Normal",
  status: getTaskStatus(patient),
  allergy: patient.priority || undefined,
  note: formatRoundNote(patient.note) || patient.access?.reason || patient.receptionist || `Statut: ${patient.workflowStatus || patient.status || ""}`,
  service: patient.service || undefined,
  lastUpdated: patient.lastUpdated || patient.lastVitalRecordedAt || patient.createdAt,
  access: patient.access,
});

export default function Rounds() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [periodFilter, setPeriodFilter] = useState<"all" | "morning" | "afternoon" | "night" | "today" | "tomorrow">("today");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const patients = await fetchNurseRounds();
      setTasks(patients.map(mapPatientToTask));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les tournées infirmières.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const summary = useMemo(() => {
    const totalPatients = new Set(tasks.map((t) => t.patient)).size;
    const pending = tasks.filter((t) => t.status !== "Terminé").length;
    const overdue = tasks.filter((t) => t.status === "En retard").length;
    const urgencies = tasks.filter((t) => t.priority === "High" && t.status !== "Terminé").length;
    return { totalPatients, pending, overdue, urgencies };
  }, [tasks]);

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

  const visibleTasks = useMemo(() => {
    return tasks
      .filter((t) => inPeriod(t.scheduledAt))
      .filter(
        (t) =>
          t.patient.toLowerCase().includes(query.toLowerCase()) ||
          t.room.toLowerCase().includes(query.toLowerCase()) ||
          t.type.toLowerCase().includes(query.toLowerCase()) ||
          (t.service || "").toLowerCase().includes(query.toLowerCase()),
      )
      .sort((a, b) => {
        const prio = { High: 0, Normal: 1, Low: 2 } as any;
        if (prio[a.priority] !== prio[b.priority]) return prio[a.priority] - prio[b.priority];
        const order = { "En retard": 0, "À faire": 1, "En cours": 2, "Terminé": 3 } as any;
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      });
  }, [tasks, periodFilter, query]);

  const timeline = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    visibleTasks.forEach((t) => {
      const h = new Date(t.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(t);
    });
    return Array.from(map.entries());
  }, [visibleTasks]);

  const markDone = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const hospitalizationId = task.hospitalizationId || task.id;
      await recordNurseRound(hospitalizationId, { action: "done", observation: "Tournée infirmière effectuée" });
      setSuccessMessage("Tâche marquée comme effectuée.");
      await loadTasks();
      setSelectedTask(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de marquer la tâche comme effectuée.");
    }
  };

  const addObservation = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setSelectedTask(task);
    setObservationText("");
    setOpenObservationModal(true);
  };

  const reportProblem = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setSelectedTask(task);
    setProblemText("");
    setOpenProblemModal(true);
  };

  const submitObservation = async () => {
    if (!selectedTask || !observationText) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const hospitalizationId = selectedTask.hospitalizationId || selectedTask.id;
      await recordNurseRound(hospitalizationId, { action: "observation", observation: observationText });
      setSuccessMessage("Observation enregistrée.");
      setOpenObservationModal(false);
      setObservationText("");
      await loadTasks();
      setSelectedTask(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer l'observation.");
    }
  };

  const submitProblem = async (escalate = false) => {
    if (!selectedTask || !problemText) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const hospitalizationId = selectedTask.hospitalizationId || selectedTask.id;
      await recordNurseRound(hospitalizationId, { action: "problem", problem: problemText, escalated: escalate });
      setSuccessMessage(escalate ? "Problème signalé et escaladé." : "Problème signalé.");
      setOpenProblemModal(false);
      setProblemText("");
      await loadTasks();
      setSelectedTask(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de signaler le problème.");
    }
  };

  const [notifications, setNotifications] = useState<string[]>([]);
  const lastAnnouncedReminder = useRef("");
  useEffect(() => {
    const id = setInterval(() => {
      const soon = tasks.find((t) => {
        const diff = new Date(t.scheduledAt).getTime() - Date.now();
        return diff > 0 && diff < 10 * 60 * 1000 && t.status !== "Terminé";
      });
      if (soon) {
        setNotifications((n) => {
          const msg = `${soon.type} — ${soon.patient} dans ${Math.ceil((new Date(soon.scheduledAt).getTime() - Date.now()) / 60000)} min`;
          if (n.includes(msg)) return n;
          return [msg, ...n].slice(0, 5);
        });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [tasks]);

  useEffect(() => {
    const reminder = notifications[0];
    if (!reminder || reminder === lastAnnouncedReminder.current || !("speechSynthesis" in window)) return;
    lastAnnouncedReminder.current = reminder;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`Rappel de tournée infirmière. ${reminder}`);
    utterance.lang = "fr-FR";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  }, [notifications]);

  useEffect(() => {
    const id = setTimeout(() => {
      setTasks((prev) =>
        prev.map((t, i) =>
          i === 0 ? { ...t, note: (t.note || "") + "\nMise à jour: ordre médecin reçu." } : t,
        ),
      );
    }, 15000);
    return () => clearTimeout(id);
  }, []);

  const { theme, toggleTheme } = useTheme();
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
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              placeholder="Rechercher patient, chambre, soin"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 rounded-2xl border px-4 py-2"
            />
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as any)}
              className="rounded-2xl border px-3 py-2"
            >
              <option value="morning">Matin</option>
              <option value="afternoon">Après-midi</option>
              <option value="night">Nuit</option>
              <option value="today">Aujourd'hui</option>
              <option value="tomorrow">Demain</option>
              <option value="all">Tous</option>
            </select>
            <button
              onClick={loadTasks}
              disabled={loading}
              className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Chargement..." : "Actualiser"}
            </button>
            <button onClick={toggleTheme} className="rounded-2xl border px-3 py-2 text-sm">
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>

          {successMessage && (
            <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-4 space-y-4">
            {timeline.length === 0 && (
              <div className="rounded-2xl p-6 bg-white">Aucune tâche pour cette période.</div>
            )}
            {timeline.map(([hour, items]) => (
              <div key={hour} className="rounded-2xl bg-white p-4 border">
                <div className="mb-2 text-sm text-slate-500 font-semibold">{hour}</div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedTask(item)}
                      className="w-full flex items-center justify-between rounded-xl border px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-semibold">{item.patient} — {item.type}</div>
                        <div className="text-xs text-slate-500">Salle {item.room}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`${statusColor[item.status]} inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold`}>
                          {item.status}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${item.priority === "High" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                          {item.priority}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="rounded-3xl border bg-white p-4 h-full">
            {!selectedTask && (
              <div className="text-slate-500">Sélectionnez une tâche pour voir les détails.</div>
            )}
            {selectedTask && (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Patient</p>
                    <h3 className="mt-1 text-xl font-semibold">{selectedTask.patient}</h3>
                    <p className="text-sm text-slate-500">Salle {selectedTask.room}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Heure</p>
                    <p className="font-semibold">{new Date(selectedTask.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Type de tâche</p>
                    <p className="mt-1 font-semibold">{selectedTask.type}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Dernière mise à jour</p>
                    <p className="mt-1 font-semibold">{new Date(selectedTask.lastUpdated || selectedTask.scheduledAt).toLocaleString('fr-FR')}</p>
                  </div>
                </div>

                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">Détails</p>
                    <p className="mt-1 font-semibold">{selectedTask.note}</p>
                  </div>
                  {selectedTask.allergy && (
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">Allergie</p>
                      <p className="mt-1 font-semibold">{selectedTask.allergy}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => markDone(selectedTask.id)}
                    className="flex-1 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    ✔ Marquer effectué
                  </button>
                  <button
                    onClick={() => addObservation(selectedTask.id)}
                    className="rounded-2xl border px-4 py-2 text-sm"
                  >
                    📝 Ajouter observation
                  </button>
                  <button
                    onClick={() => reportProblem(selectedTask.id)}
                    className="rounded-2xl border border-red-400 px-4 py-2 text-sm text-red-700"
                  >
                    🚨 Signaler problème
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-3xl border bg-white p-4">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              {notifications.length === 0 && <div className="text-slate-500">Aucune notification</div>}
              {notifications.map((n, i) => (
                <div key={i} className="rounded-lg bg-slate-50 p-2">{n}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

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
                {observationSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setObservationText(s)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                value={observationText}
                onChange={(e) => setObservationText(e.target.value)}
                rows={4}
                className="w-full rounded-2xl border p-3"
                placeholder="Observation rapide..."
              />
              <div className="flex gap-3 flex-col sm:flex-row">
                <button onClick={submitObservation} className="flex-1 rounded-2xl bg-slate-900 px-4 py-2 text-white">Enregistrer</button>
                <button onClick={() => setOpenObservationModal(false)} className="flex-1 rounded-2xl border px-4 py-2">Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                {problemSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setProblemText(s)}
                    className="rounded-full bg-red-50 px-3 py-1 text-sm text-red-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                value={problemText}
                onChange={(e) => setProblemText(e.target.value)}
                rows={4}
                className="w-full rounded-2xl border p-3"
                placeholder="Décrivez le problème..."
              />
              <div className="flex gap-3 flex-col sm:flex-row">
                <button onClick={() => submitProblem(true)} className="flex-1 rounded-2xl bg-red-700 px-4 py-2 text-white">Signaler & escalader</button>
                <button onClick={() => submitProblem(false)} className="flex-1 rounded-2xl border px-4 py-2">Signaler sans escalade</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
