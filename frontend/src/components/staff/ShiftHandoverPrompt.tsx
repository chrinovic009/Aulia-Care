import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getWorkMode, setWorkMode, subscribeWorkMode, type WorkMode } from "./offDuty";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../context/AuthContext";

type HandoverState = {
  applicable: boolean;
  due: boolean;
  plannedEndAt?: string;
  reminderAt?: string | null;
  deferredCount?: number;
};

/**
 * Rôles correspondant au personnel opérationnel soumis
 * au pointage et à la relève de poste.
 *
 * SUPER_ADMIN, ADMIN, DEV et PATIENT sont volontairement exclus.
 */
const attendanceRoles = new Set([
  "RECEPTIONIST",
  "NURSE",
  "PHYSICIAN",
  "LAB_MANAGER",
  "LAB_TECHNICIAN",
  "RADIOLOGIST",
  "PHARMACIST",
  "CASHIER",
  "FINANCE",
  "SURGEON",
  "ANESTHESIOLOGIST",
  "MIDWIFE",
  "PARAMEDIC",
  "DISPATCHER",
]);

/**
 * Global shift-end prompt.
 *
 * Le composant ne s'applique qu'au personnel opérationnel.
 * Il n'authentifie jamais le remplaçant : celui-ci doit se connecter
 * avec sa propre session et ses propres identifiants.
 */
export function ShiftHandoverPrompt() {
  const { currentUser } = useAuth();
  const workMode = useSyncExternalStore(subscribeWorkMode, getWorkMode, getWorkMode);

  const [handover, setHandover] = useState<HandoverState | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const isAttendanceUser =
    !!currentUser && attendanceRoles.has(currentUser.primaryRole);

  const refresh = useCallback(async () => {
    if (!currentUser || !attendanceRoles.has(currentUser.primaryRole)) {
      setHandover(null);
      return;
    }

    try {
      const [state, mode] = await Promise.all([
        apiFetch<HandoverState>("/users/me/shift-handover"),
        apiFetch<WorkMode>("/users/me/work-mode"),
      ]);

      setHandover(state);
      setWorkMode(mode);
    } catch {
      // Les erreurs de session/authentification sont gérées globalement.
      // Un échec temporaire ne doit pas déclencher de modal parasite.
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isAttendanceUser) {
      setHandover(null);
      return;
    }

    /**
     * Le pointage est créé uniquement pour un utilisateur appartenant
     * réellement au personnel opérationnel.
     *
     * Le backend déduplique une présence déjà ouverte.
     */
    void apiFetch("/users/me/clock-in", {
      method: "POST",
    })
      .then(refresh)
      .catch(() => undefined);

    /**
     * Polling limité au personnel concerné par la relève.
     */
    const timer = window.setInterval(() => {
      void refresh();
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isAttendanceUser, refresh]);

  const decide = async (
    decision: "LEAVE" | "REMIND",
    reminderMinutes?: number,
  ) => {
    setBusy(true);

    try {
      await apiFetch("/users/me/shift-handover/decision", {
        method: "POST",
        body: JSON.stringify({
          decision,
          reminderMinutes,
          reason: reason.trim() || undefined,
        }),
      });

      if (decision === "LEAVE") {
        // The session is not closed: it switches to read-only until the next shift.
        setReason("");
        await refresh();
        return;
      }

      setReason("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!handover?.due) {
    return workMode.readOnly ? <OffDutyBanner mode={workMode} /> : null;
  }

  const end = handover.plannedEndAt
    ? new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "long",
      }).format(new Date(handover.plannedEndAt))
    : "l’heure prévue";

  return (
    <div
      className="fixed inset-0 z-[100100] grid place-items-center bg-slate-950/65 p-4"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-handover-title"
        className="w-full max-w-lg rounded-3xl border border-aulia-teal/25 bg-white p-6 shadow-2xl dark:bg-slate-950 sm:p-8"
      >
        <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">
          Relève de poste · Aulia Care
        </p>

        <h2
          id="shift-handover-title"
          className="mt-2 text-xl font-bold text-aulia-navy dark:text-white"
        >
          Votre heure de sortie est arrivée
        </h2>

        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Votre poste était prévu jusqu’au {end}. Confirmez votre départ
          uniquement après avoir transmis les informations nécessaires à votre
          relève.
        </p>

        <label className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Information de relève{" "}
          <span className="font-normal text-slate-400">(facultatif)</span>

          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Ex. transmission effectuée, attente du remplaçant…"
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("LEAVE")}
            className="rounded-xl bg-aulia-teal px-4 py-3 text-sm font-bold text-white transition hover:bg-aulia-teal/90 disabled:opacity-60"
          >
            Oui, je suis prêt(e) à quitter
          </button>

          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Votre session restera ouverte en lecture seule : vous pourrez
            consulter, mais plus rien enregistrer jusqu’à votre prochain poste.
            Votre remplaçant se connecte avec son propre compte.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {[5, 10, 15].map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={busy}
                onClick={() => void decide("REMIND", minutes)}
                className="rounded-xl border border-aulia-teal/35 px-2 py-2.5 text-sm font-semibold text-aulia-teal hover:bg-aulia-mist disabled:opacity-60 dark:hover:bg-aulia-teal/10"
              >
                Rappeler dans {minutes} min
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
/** Persistent notice of the off-duty read-only session. */
function OffDutyBanner({ mode }: { mode: WorkMode }) {
  const since = mode.since ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(mode.since)) : null;
  return (
    <div role="status" className="aulia-offduty-banner fixed inset-x-3 bottom-3 z-[100050] mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-xl backdrop-blur dark:border-amber-500/40 dark:bg-amber-950/90 dark:text-amber-100 sm:bottom-5">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-lg" aria-hidden="true">🔒</span>
      <p><strong>Poste terminé{since ? ` à ${since}` : ""} — lecture seule.</strong> Vous pouvez consulter les dossiers et vos messages ; les enregistrements reprendront à votre prochain poste.</p>
    </div>
  );
}
