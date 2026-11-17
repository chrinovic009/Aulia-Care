import { useState } from "react";
import { apiFetch } from "../../config/api";

/**
 * Forgotten password: the person only asks. An administrator of the
 * establishment approves and hands over a new 6-digit code; signing in with
 * it opens the screen where the person chooses a new password.
 */
export default function ForgotPasswordDialog({ initialIdentifier = "", onClose }: { initialIdentifier?: string; onClose: () => void }) {
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const submit = async () => {
    setSending(true); setError(null);
    try {
      const answer = await apiFetch<{ message: string }>("/auth/password-reset-requests", { method: "POST", body: JSON.stringify({ identifier: identifier.trim() }) });
      setMessage(answer.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La demande n’a pas pu être envoyée. Réessayez dans quelques minutes.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100000] grid place-items-center overflow-y-auto bg-slate-950/60 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="forgot-title" className="my-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Mot de passe oublié</p>
        <h2 id="forgot-title" className="mt-2 text-xl font-bold text-aulia-navy dark:text-white">Demander un nouveau code</h2>
        {message ? (
          <>
            <p className="mt-4 text-sm leading-6 text-slate-700 dark:text-slate-200">{message}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Dès que l’administrateur vous a remis votre code à 6 chiffres, connectez-vous avec votre identifiant et ce code : vous choisirez alors votre nouveau mot de passe.</p>
            <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-aulia-navy px-4 py-2.5 text-sm font-semibold text-white">Compris</button>
          </>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Votre demande part à l’administrateur de votre établissement. Après approbation, il vous remet un nouveau code à 6 chiffres.</p>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              E-mail, nom d’utilisateur ou matricule
              <input autoComplete="username" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </label>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300">Annuler</button>
              <button type="submit" disabled={sending || !identifier.trim()} className="rounded-xl bg-aulia-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{sending ? "Envoi…" : "Envoyer la demande"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
