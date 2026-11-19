import type { ReactNode } from "react";
import type { CarePriority } from "../../api/careWorkflow";
import { PRIORITY_LABELS } from "../../api/careWorkflow";

export const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-900 dark:text-white";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-white/[0.03] ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-base font-bold text-aulia-navy dark:text-white">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ children, onClick, tone = "primary", disabled, type = "button", small }: {
  children: ReactNode; onClick?: () => void; tone?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; type?: "button" | "submit"; small?: boolean;
}) {
  const tones = {
    primary: "bg-aulia-teal text-white hover:bg-[#087c73]",
    secondary: "border border-aulia-teal/40 text-aulia-teal hover:bg-aulia-mist dark:hover:bg-aulia-teal/10",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
  } as const;
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={`rounded-lg font-bold disabled:cursor-not-allowed disabled:opacity-50 ${small ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"} ${tones[tone]}`}>
      {children}
    </button>
  );
}

const PRIORITY_TONES: Record<CarePriority, string> = {
  STAT: "bg-red-600 text-white",
  ASAP: "bg-orange-500 text-white",
  URGENT: "bg-amber-300 text-amber-950",
  ROUTINE: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
};
export const PriorityBadge = ({ priority }: { priority: CarePriority }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${PRIORITY_TONES[priority]}`}>{PRIORITY_LABELS[priority]}</span>
);

export const Badge = ({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "teal" | "red" | "amber" | "green" }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    teal: "bg-aulia-mist text-aulia-navy dark:bg-aulia-teal/15 dark:text-aulia-mist",
    red: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  } as const;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
};

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[99990] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className={`mt-8 w-full ${wide ? "max-w-5xl" : "max-w-xl"} rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-950`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-aulia-navy dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">{children}</p>;

export const Stat = ({ label, value, tone }: { label: string; value: ReactNode; tone?: "red" | "amber" | "teal" }) => (
  <div className={`rounded-2xl border p-4 ${tone === "red" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : tone === "amber" ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-white/[0.03]"}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-aulia-navy dark:text-white">{value}</p>
  </div>
);
