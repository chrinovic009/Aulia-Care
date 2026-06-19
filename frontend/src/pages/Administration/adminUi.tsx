import type { ReactNode } from "react";

export type Tone = "slate" | "blue" | "green" | "amber" | "red" | "violet";

const toneClasses: Record<Tone, string> = {
  slate: "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-white/[0.03] dark:text-white",
  blue: "border-blue-100 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200",
  green: "border-emerald-100 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
  amber: "border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
  red: "border-red-100 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
  violet: "border-violet-100 bg-violet-50 text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-200",
};

export function AdminPageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-white/[0.03] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Administration clinique</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        <div className="mt-6 space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "slate",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          {hint ? <p className="mt-1 text-xs opacity-70">{hint}</p> : null}
        </div>
        <div className="rounded-lg bg-white/70 p-2 text-current shadow-sm dark:bg-white/10">{icon}</div>
      </div>
    </div>
  );
}

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-white/[0.03]">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ label, tone = "slate" }: { label: string; tone?: Tone }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}

export function DataTable({
  headers,
  rows,
  empty = "Aucune donnee disponible.",
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">{empty}</td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={index} className="transition hover:bg-slate-50/80 dark:hover:bg-white/[0.04]">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 align-middle text-slate-700 dark:text-slate-200">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatMoney(value: number | string | null | undefined, currency = "USD") {
  return `${Number(value || 0).toLocaleString("fr-FR")} ${currency}`;
}
