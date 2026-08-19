import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { useRealtime } from "../../context/RealtimeContext";
import { fetchNurseRounds, NursingCareTask, recordNurseObservation, updateNurseCareTask } from "../../api/nurse";

type DisplayStatus = "À faire" | "Terminé" | "Manqué" | "Escaladé" | "En retard";
type Action = "complete" | "observe" | "problem";

const statusColor: Record<DisplayStatus, string> = {
  "À faire": "bg-sky-100 text-sky-700", "Terminé": "bg-emerald-100 text-emerald-700",
  "Manqué": "bg-slate-200 text-slate-700", "Escaladé": "bg-amber-100 text-amber-800",
  "En retard": "bg-red-100 text-red-700",
};
const statusOf = (task: NursingCareTask): DisplayStatus =>
  task.status === "COMPLETED" ? "Terminé" : task.status === "MISSED" ? "Manqué" :
  task.status === "ESCALATED" ? "Escaladé" : task.status === "OVERDUE" ? "En retard" : "À faire";
const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export default function Rounds() {
  const [tasks, setTasks] = useState<NursingCareTask[]>([]);
  const [selected, setSelected] = useState<NursingCareTask | null>(null);
  const [filter, setFilter] = useState<"today" | "tomorrow" | "morning" | "afternoon" | "night" | "all">("today");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [escalate, setEscalate] = useState(true);
  const [reminders, setReminders] = useState<string[]>([]);
  const announced = useRef(new Set<string>());
  const { socket } = useRealtime();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await fetchNurseRounds();
      setTasks(result);
      setSelected((current) => result.find((task) => task.id === current?.id) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger les tâches planifiées.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const model = (event as CustomEvent<{ model?: string }>).detail?.model;
      if (!model || ["NursingCareTask", "Hospitalization", "MedicationAdministration"].includes(model)) void load();
    };
    window.addEventListener("aulia:clinicalDataUpdated", refresh);
    window.addEventListener("aulia:realtime:update", refresh);
    socket?.on("nursing-care-task.updated", load);
    return () => {
      window.removeEventListener("aulia:clinicalDataUpdated", refresh);
      window.removeEventListener("aulia:realtime:update", refresh);
      socket?.off("nursing-care-task.updated", load);
    };
  }, [load, socket]);

  const visible = useMemo(() => {
    const now = new Date();
    return tasks.filter((task) => {
      const due = new Date(task.scheduledAt);
      const inPeriod = filter === "all" ||
        (filter === "today" && startOf(due).getTime() === startOf(now).getTime()) ||
        (filter === "tomorrow" && startOf(due).getTime() === startOf(new Date(now.getTime() + 86_400_000)).getTime()) ||
        (filter === "morning" && due.getHours() >= 6 && due.getHours() < 12) ||
        (filter === "afternoon" && due.getHours() >= 12 && due.getHours() < 18) ||
        (filter === "night" && (due.getHours() >= 18 || due.getHours() < 6));
      const text = query.trim().toLocaleLowerCase();
      return inPeriod && (!text || [task.patient, task.room, task.title, task.service || ""].some((value) => value.toLocaleLowerCase().includes(text)));
    }).sort((a, b) => (a.status === "OVERDUE" ? -1 : b.status === "OVERDUE" ? 1 : a.priority === "HIGH" ? -1 : b.priority === "HIGH" ? 1 : new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()));
  }, [filter, query, tasks]);

  const summary = useMemo(() => {
    const active = tasks.filter((task) => !["COMPLETED", "MISSED", "CANCELLED"].includes(task.status));
    return { patients: new Set(active.map((task) => task.patientId)).size, pending: active.length, overdue: tasks.filter((task) => task.status === "OVERDUE").length, escalated: tasks.filter((task) => task.status === "ESCALATED").length };
  }, [tasks]);
  const timeline = useMemo(() => visible.reduce<Map<string, NursingCareTask[]>>((map, task) => {
    const key = new Date(task.scheduledAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    map.set(key, [...(map.get(key) || []), task]); return map;
  }, new Map()), [visible]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      tasks.filter((task) => task.status === "PENDING" && new Date(task.scheduledAt).getTime() > now && new Date(task.scheduledAt).getTime() - now <= 600_000).forEach((task) => {
        if (announced.current.has(task.id)) return;
        announced.current.add(task.id);
        const message = `${task.title} — ${task.patient} dans ${Math.max(1, Math.ceil((new Date(task.scheduledAt).getTime() - now) / 60_000))} min`;
        setReminders((current) => [message, ...current].slice(0, 5));
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const speech = new SpeechSynthesisUtterance(`Rappel de tournée. ${message}`);
          speech.lang = "fr-FR"; window.speechSynthesis.speak(speech);
        }
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [tasks]);

  const openAction = (next: Action) => { setAction(next); setNote(""); setEscalate(next === "problem"); };
  const submit = async () => {
    if (!selected || !action || !note.trim()) { setError("Une observation clinique est obligatoire."); return; }
    try {
      setError(null);
      if (action === "complete") {
        await updateNurseCareTask(selected.id, { status: "COMPLETED", observation: note.trim() });
        setSuccess("Soin attesté et clôturé.");
      } else if (action === "problem") {
        await updateNurseCareTask(selected.id, escalate ? { status: "ESCALATED", observation: note.trim(), escalationReason: note.trim() } : { status: "MISSED", observation: note.trim() });
        setSuccess(escalate ? "Problème escaladé au médecin responsable." : "Soin déclaré non réalisé avec motif.");
      } else {
        await recordNurseObservation(selected.hospitalizationId, note.trim());
        setSuccess("Observation clinique enregistrée.");
      }
      setAction(null); setNote(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action clinique impossible à enregistrer."); }
  };

  return <div className="min-h-screen bg-slate-50 p-4 sm:p-6 dark:bg-slate-950">
    <PageMeta title="Tournées & horaires | Aulia Care" description="Tâches de soins infirmiers planifiées et traçables" />
    <PageBreadcrumb pageTitle="Tournées & horaires" />
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Patients à visiter", summary.patients, ""], ["Tâches restantes", summary.pending, ""], ["Soins en retard", summary.overdue, "text-red-600"], ["Escalades actives", summary.escalated, "text-amber-700"]].map(([label, value, color]) => <div key={label} className="rounded-3xl border bg-white p-4 dark:bg-slate-900"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${color}`}>{value}</p></div>)}</div>
    <p className="mt-3 text-xs text-slate-500">Seuls les soins réellement planifiés dans le dossier d’hospitalisation sont affichés. Les rappels vocaux nécessitent que l’application reste ouverte.</p>
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]"><section>
      <div className="flex flex-col gap-3 sm:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patient, chambre, soin" className="flex-1 rounded-2xl border px-4 py-2" /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="rounded-2xl border px-3 py-2"><option value="today">Aujourd’hui</option><option value="tomorrow">Demain</option><option value="morning">Matin</option><option value="afternoon">Après-midi</option><option value="night">Nuit</option><option value="all">Toutes</option></select><button onClick={() => void load()} disabled={loading} className="rounded-2xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60">{loading ? "Chargement…" : "Actualiser"}</button></div>
      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}{success && <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}
      <div className="mt-4 space-y-4">{!loading && !timeline.size && <div className="rounded-2xl border bg-white p-6 text-slate-500">Aucun soin planifié pour cette période.</div>}{[...timeline].map(([time, items]) => <div key={time} className="rounded-2xl border bg-white p-4 dark:bg-slate-900"><p className="mb-2 text-sm font-semibold text-slate-500">{time}</p><div className="space-y-2">{items.map((task) => { const state = statusOf(task); return <button key={task.id} onClick={() => setSelected(task)} className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><div><p className="font-semibold">{task.patient} — {task.title}</p><p className="text-xs text-slate-500">Chambre {task.room}{task.service ? ` · ${task.service}` : ""}</p></div><span className={`${statusColor[state]} rounded-full px-3 py-1 text-xs font-semibold`}>{state}</span></button>; })}</div></div>)}</div>
    </section><aside className="space-y-4"><div className="rounded-3xl border bg-white p-4 dark:bg-slate-900">{!selected ? <p className="text-slate-500">Sélectionnez une tâche pour consulter les consignes et l’exécuter.</p> : <><div className="flex justify-between gap-3"><div><p className="text-xs text-slate-500">Patient</p><h3 className="text-xl font-semibold">{selected.patient}</h3><p className="text-sm text-slate-500">Chambre {selected.room}</p></div><p className="text-right text-sm font-semibold">{new Date(selected.scheduledAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p></div><div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">Consignes prescrites</p><p className="mt-1 whitespace-pre-wrap">{selected.instructions || "Aucune consigne complémentaire."}</p></div>{selected.escalationReason && <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-amber-900">{selected.escalationReason}</div>}<div className="mt-4 grid gap-2"><button disabled={!selected.access?.canWrite || ["COMPLETED", "CANCELLED"].includes(selected.status)} onClick={() => openAction("complete")} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Attester le soin effectué</button><button disabled={!selected.access?.canWrite} onClick={() => openAction("observe")} className="rounded-2xl border px-4 py-2 text-sm">Ajouter une observation</button><button disabled={!selected.access?.canWrite} onClick={() => openAction("problem")} className="rounded-2xl border border-red-300 px-4 py-2 text-sm text-red-700">Signaler un problème</button></div>{!selected.access?.canWrite && <p className="mt-3 text-xs text-amber-700">{selected.access?.reason || "Écriture non autorisée hors shift actif."}</p>}</>}</div><div className="rounded-3xl border bg-white p-4 dark:bg-slate-900"><p className="font-semibold">Rappels actifs</p><div className="mt-3 space-y-2 text-sm">{reminders.length ? reminders.map((item) => <p key={item} className="rounded-lg bg-slate-50 p-2">{item}</p>) : <p className="text-slate-500">Aucun rappel imminent.</p>}</div></div></aside></div>
    {action && selected && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-semibold">{action === "complete" ? "Attester le soin" : action === "observe" ? "Observation clinique" : "Signaler un problème"}</h3><p className="text-sm text-slate-500">{selected.patient} — {selected.title}</p><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} maxLength={2000} placeholder="Constat clinique et preuve d’exécution…" className="mt-4 w-full rounded-2xl border p-3" />{action === "problem" && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={escalate} onChange={(event) => setEscalate(event.target.checked)} /> Prévenir immédiatement le médecin responsable</label>}<div className="mt-4 flex gap-3"><button onClick={() => void submit()} className="flex-1 rounded-2xl bg-slate-900 px-4 py-2 font-semibold text-white">Enregistrer</button><button onClick={() => setAction(null)} className="rounded-2xl border px-4 py-2">Annuler</button></div></div></div>}
  </div>;
}
