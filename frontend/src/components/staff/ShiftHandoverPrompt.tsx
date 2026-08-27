import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../context/AuthContext";

type HandoverState = {
  applicable: boolean;
  due: boolean;
  plannedEndAt?: string;
  reminderAt?: string | null;
  deferredCount?: number;
};

const staffRoles = new Set(["ADMIN", "RECEPTIONIST", "NURSE", "PHYSICIAN", "LAB_MANAGER", "LAB_TECHNICIAN", "RADIOLOGIST", "PHARMACIST", "CASHIER", "FINANCE", "SURGEON", "ANESTHESIOLOGIST"]);

/** Global shift-end prompt. It never authenticates a replacement: the next
 * employee must still sign in with their own session and PIN. */
export function ShiftHandoverPrompt() {
  const { currentUser, logout } = useAuth();
  const [handover, setHandover] = useState<HandoverState | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const refresh = useCallback(async () => {
    if (!currentUser || !staffRoles.has(currentUser.primaryRole)) {
      setHandover(null);
      return;
    }
    try {
      setHandover(await apiFetch<HandoverState>("/users/me/shift-handover"));
    } catch {
      // Session/auth feedback is handled centrally. A failed poll must not
      // produce a duplicate modal every minute.
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && staffRoles.has(currentUser.primaryRole)) {
      // Attendance is created once per authenticated work session. The server
      // de-duplicates an already open attendance record.
      void apiFetch("/users/me/clock-in", { method: "POST" }).then(refresh).catch(() => undefined);
    } else {
      void refresh();
    }
    // A short polling interval is intentionally limited to authenticated staff
    // and one tiny scoped endpoint; it keeps the shift-end decision prompt
    // timely even if a transient WebSocket connection is unavailable.
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [currentUser, refresh]);

  const decide = async (decision: "LEAVE" | "REMIND", reminderMinutes?: number) => {
    setBusy(true);
    try {
      await apiFetch("/users/me/shift-handover/decision", {
        method: "POST",
        body: JSON.stringify({ decision, reminderMinutes, reason: reason.trim() || undefined }),
      });
      if (decision === "LEAVE") {
        logout();
        return;
      }
      setReason("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!handover?.due) return null;
  const end = handover.plannedEndAt
    ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "long" }).format(new Date(handover.plannedEndAt))
    : "l’heure prévue";

  return (
    <div className="fixed inset-0 z-[100100] grid place-items-center bg-slate-950/65 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="shift-handover-title" className="w-full max-w-lg rounded-3xl border border-aulia-teal/25 bg-white p-6 shadow-2xl dark:bg-slate-950 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Relève de poste · Aulia Care</p>
        <h2 id="shift-handover-title" className="mt-2 text-xl font-bold text-aulia-navy dark:text-white">Votre heure de sortie est arrivée</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Votre poste était prévu jusqu’au {end}. Confirmez votre départ uniquement après avoir transmis les informations nécessaires à votre relève.</p>
        <label className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Information de relève <span className="font-normal text-slate-400">(facultatif)</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={3} placeholder="Ex. transmission effectuée, attente du remplaçant…" className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        </label>
        <div className="mt-6 flex flex-col gap-3">
          <button type="button" disabled={busy} onClick={() => void decide("LEAVE")} className="rounded-xl bg-aulia-teal px-4 py-3 text-sm font-bold text-white transition hover:bg-aulia-teal/90 disabled:opacity-60">Oui, je suis prêt(e) à quitter</button>
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">Vous serez déconnecté(e) de cette session. Votre remplaçant devra se connecter avec son propre compte.</p>
          <div className="grid grid-cols-3 gap-2">
            {[5, 10, 15].map((minutes) => <button key={minutes} type="button" disabled={busy} onClick={() => void decide("REMIND", minutes)} className="rounded-xl border border-aulia-teal/35 px-2 py-2.5 text-sm font-semibold text-aulia-teal hover:bg-aulia-mist disabled:opacity-60 dark:hover:bg-aulia-teal/10">Rappeler dans {minutes} min</button>)}
          </div>
        </div>
      </section>
    </div>
  );
}
