import type { ReactNode } from "react";

export const money = (value: number, currency = "CDF") => `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency}`;
export const day = (value: string | null | undefined) => (value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("fr-FR") : "—");
export const dateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
export const monthLabel = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
export const errorText = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

export const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white";

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          {title && <h2 className="font-semibold text-aulia-navy dark:text-white">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

const TONES = { green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300", red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300", amber: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300", slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", teal: "bg-aulia-teal/10 text-aulia-teal" };
export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export const LEAVE_STATUS: Record<string, { label: string; tone: keyof typeof TONES }> = {
  PENDING: { label: "En attente", tone: "amber" }, APPROVED: { label: "Accordé", tone: "green" }, REJECTED: { label: "Refusé", tone: "red" }, CANCELLED: { label: "Annulé", tone: "slate" },
};
export const REPLACEMENT_STATUS: Record<string, { label: string; tone: keyof typeof TONES }> = {
  PENDING_COLLEAGUE: { label: "Attend le collègue", tone: "amber" }, PENDING_ADMIN: { label: "Attend l’administration", tone: "amber" },
  APPROVED: { label: "Validé", tone: "green" }, DECLINED: { label: "Refusé par le collègue", tone: "red" }, REJECTED: { label: "Refusé", tone: "red" }, CANCELLED: { label: "Annulé", tone: "slate" },
};
export const PAY_STATE: Record<string, { label: string; tone: keyof typeof TONES }> = {
  PAID: { label: "Payé", tone: "green" }, LATE: { label: "En retard", tone: "red" }, TO_PAY: { label: "À payer", tone: "amber" },
};
export const CONTRACT_TYPES: Record<string, string> = { PERMANENT: "CDI", TEMPORARY: "CDD", CONTRACTOR: "Prestataire" };

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-900 ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-aulia-navy dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer">✕</button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Button({ children, onClick, tone = "primary", disabled, type = "button", small }: { children: ReactNode; onClick?: () => void; tone?: "primary" | "secondary" | "danger"; disabled?: boolean; type?: "button" | "submit"; small?: boolean }) {
  const tones = { primary: "bg-aulia-navy text-white hover:bg-aulia-navy/90", secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200", danger: "bg-red-600 text-white hover:bg-red-700" };
  return <button type={type} onClick={onClick} disabled={disabled} className={`rounded-xl font-semibold disabled:opacity-50 ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} ${tones[tone]}`}>{children}</button>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const tones = { info: "bg-aulia-mist text-aulia-navy", error: "bg-red-50 text-red-700", success: "bg-emerald-50 text-emerald-700" };
  return <p className={`rounded-xl p-3 text-sm ${tones[tone]}`}>{children}</p>;
}
