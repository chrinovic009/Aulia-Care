import { useState, type ReactNode } from "react";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../context/AuthContext";

const MIN_LENGTH = 6;

/** Same rules as the server (backend/src/auth/password-policy.ts); the server has the last word. */
export function passwordProblem(password: string) {
  if (password.length < MIN_LENGTH) return `Au moins ${MIN_LENGTH} caractères.`;
  if (!/\p{L}/u.test(password)) return "Au moins une lettre.";
  if (!/\d/.test(password)) return "Au moins un chiffre.";
  if (!/[^\p{L}\d\s]/u.test(password)) return "Au moins un symbole (par exemple ! @ # - _ .).";
  return null;
}

const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white";

/** Change of the account holder's own password. `required`: first sign-in or reset by the administrator. */
export function ChangePasswordForm({ required = false, onDone, onCancel }: { required?: boolean; onDone: () => void; onCancel?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const problem = next ? passwordProblem(next) : null;

  const submit = async () => {
    if (problem) { setError(problem); return; }
    if (next !== confirmation) { setError("Les deux saisies du nouveau mot de passe sont différentes."); return; }
    setSaving(true); setError(null);
    try {
      await apiFetch("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      setCurrent(""); setNext(""); setConfirmation("");
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le changement de mot de passe a échoué.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {required ? "Code à 6 chiffres reçu de l’administrateur" : "Mot de passe actuel"}
        <input type="password" autoComplete="current-password" inputMode={required ? "numeric" : undefined} className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Nouveau mot de passe
        <input type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
        <span className={`mt-1 block text-xs ${problem ? "text-red-600" : "text-slate-500"}`}>{problem ?? `Au moins ${MIN_LENGTH} caractères, avec des lettres, des chiffres et un symbole.`}</span>
      </label>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Confirmer le nouveau mot de passe
        <input type="password" autoComplete="new-password" className={inputClass} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Annuler</button>}
        <button type="submit" disabled={saving || !current || !next || !confirmation} className="rounded-xl bg-aulia-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Enregistrement…" : "Enregistrer mon mot de passe"}
        </button>
      </div>
    </form>
  );
}

/**
 * An account opened or reset by an administrator signs in with the temporary
 * password, then lands here: nothing else of the application is shown (the
 * server refuses every other call) until its holder has chosen their own password.
 */
export default function PasswordChangeGate({ children }: { children: ReactNode }) {
  const { currentUser, markPasswordChanged, logout } = useAuth();
  if (!currentUser?.mustChangePassword) return <>{children}</>;
  return (
    <main className="grid min-h-dvh place-items-center bg-aulia-mist p-4 dark:bg-slate-950">
      <section role="dialog" aria-modal="true" aria-labelledby="password-change-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Première connexion</p>
        <h1 id="password-change-title" className="mt-2 text-xl font-bold text-aulia-navy dark:text-white">Choisissez votre mot de passe</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Bonjour {currentUser.firstName || currentUser.displayName}. Vous êtes connecté avec le code à 6 chiffres remis par l’administrateur.
          Choisissez maintenant votre mot de passe : personne d’autre que vous ne doit le connaître.
        </p>
        {Boolean(currentUser.accessCodeReveals?.length) && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">Votre code a été affiché par :</p>
            <ul className="mt-1 list-disc pl-4">{currentUser.accessCodeReveals!.map((item, index) => <li key={index}>{item.by} — {new Date(item.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</li>)}</ul>
            <p className="mt-1">Si vous ne reconnaissez pas une de ces personnes, prévenez la direction après avoir choisi votre mot de passe.</p>
          </div>
        )}
        <div className="mt-5"><ChangePasswordForm required onDone={markPasswordChanged} /></div>
        <button type="button" onClick={logout} className="mt-4 w-full text-center text-sm text-slate-500 underline">Se déconnecter</button>
      </section>
    </main>
  );
}
