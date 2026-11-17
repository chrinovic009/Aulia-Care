import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../config/api";

type PendingCode = { userId: string; name: string; username: string; primaryRole: string; code: string; reason: "NEW_ACCOUNT" | "RESET" | string; issuedAt?: string | null; wrongAttempts: number };

/**
 * 6-digit codes issued and not yet used. They stay listed here until their
 * holder has signed in with the code and chosen a password, so the
 * administrator can hand them over at any time.
 */
export default function PendingAccessCodes({ roleLabel, refreshKey = 0 }: { roleLabel: (role: string) => string; refreshKey?: number }) {
  const [rows, setRows] = useState<PendingCode[]>([]);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const load = useCallback(() => { void apiFetch<PendingCode[]>("/users/pending-access-codes").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 30_000); return () => window.clearInterval(timer); }, [load, refreshKey]);
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border border-aulia-teal/30 bg-aulia-mist/60 p-4 text-sm text-aulia-navy dark:bg-slate-900 dark:text-slate-100">
      <h2 className="font-semibold">Codes d’accès à remettre ({rows.length})</h2>
      <p className="mt-1 text-xs opacity-80">Chaque code reste ici jusqu’à ce que la personne se soit connectée avec lui et ait choisi son mot de passe. Remettez-le en main propre, après avoir vérifié son identité.</p>
      <ul className="mt-3 space-y-2">{rows.map((row) => (
        <li key={row.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/80 p-3 dark:bg-slate-950/60">
          <span>
            <strong>{row.name}</strong> · {roleLabel(row.primaryRole)} · identifiant <strong>{row.username}</strong>
            <span className="block text-xs opacity-70">
              {row.reason === "RESET" ? "Mot de passe oublié" : "Nouveau compte"}
              {row.issuedAt ? ` · émis le ${new Date(row.issuedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : ""}
              {row.wrongAttempts ? ` · ${row.wrongAttempts} essai(s) erroné(s) sur 5` : ""}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded-lg bg-aulia-navy/5 px-3 py-1.5 font-mono text-xl font-bold tracking-[.3em] dark:bg-white/10">{shown[row.userId] ? row.code : "••••••"}</span>
            <button type="button" onClick={() => setShown((current) => ({ ...current, [row.userId]: !current[row.userId] }))} className="rounded-lg px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">{shown[row.userId] ? "Masquer" : "Afficher"}</button>
          </span>
        </li>
      ))}</ul>
    </section>
  );
}
