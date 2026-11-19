import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../config/api";

export type PasswordResetRequestRow = {
  id: string; requestedAt: string;
  user: { id: string; firstName: string; lastName: string; displayName?: string | null; username: string; primaryRole: string; Employee?: Array<{ employeeNumber?: string | null }> };
};

/**
 * Forgotten-password requests waiting for this administrator. Approving
 * generates a 6-digit code, shown once, to hand over to the person (after
 * checking who they are); their open sessions end.
 */
export default function PasswordResetRequests({ roleLabel, onCode }: { roleLabel: (role: string) => string; onCode: (credential: { name: string; username: string; password: string }) => void }) {
  const [rows, setRows] = useState<PasswordResetRequestRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { void apiFetch<PasswordResetRequestRow[]>("/users/password-reset-requests").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 30_000); return () => window.clearInterval(timer); }, [load]);
  if (!rows.length) return null;
  const decide = async (row: PasswordResetRequestRow, approve: boolean) => {
    setBusy(row.id); setError(null);
    try {
      if (approve) {
        const result = await apiFetch<{ name: string; username: string; generatedPassword: string }>(`/users/password-reset-requests/${row.id}/approve`, { method: "POST", body: "{}" });
        onCode({ name: result.name, username: result.username, password: result.generatedPassword });
      } else {
        await apiFetch(`/users/password-reset-requests/${row.id}/reject`, { method: "POST", body: JSON.stringify({ note: "Demande non reconnue" }) });
      }
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’opération a échoué.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
      <h2 className="font-semibold">Mots de passe oubliés à traiter ({rows.length})</h2>
      <p className="mt-1 text-xs">Vérifiez l’identité de la personne avant d’approuver : le code à 6 chiffres généré lui permet de se connecter et de choisir un nouveau mot de passe.</p>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      <ul className="mt-3 space-y-2">{rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 p-3 dark:bg-slate-900/60">
          <span>
            <strong>{row.user.displayName || `${row.user.firstName} ${row.user.lastName}`}</strong> · {roleLabel(row.user.primaryRole)} · {row.user.username}
            {row.user.Employee?.[0]?.employeeNumber ? ` · matricule ${row.user.Employee[0].employeeNumber}` : ""}
            <span className="block text-xs opacity-70">Demandé le {new Date(row.requestedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
          </span>
          <span className="flex gap-2">
            <button type="button" disabled={busy === row.id} onClick={() => void decide(row, false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200">Refuser</button>
            <button type="button" disabled={busy === row.id} onClick={() => void decide(row, true)} className="rounded-lg bg-aulia-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approuver et générer le code</button>
          </span>
        </li>
      ))}</ul>
    </section>
  );
}
