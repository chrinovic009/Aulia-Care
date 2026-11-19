import type React from "react";
import type { DoctorPatient } from "../../api/doctor";
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "blue" | "red" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    green: "text-emerald-700 dark:text-emerald-300",
    blue: "text-blue-700 dark:text-blue-300",
    red: "text-red-700 dark:text-red-300",
  };
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p></div>;
}

export function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition duration-150 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-sm leading-5 text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

export function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><div className="mt-1 font-medium text-slate-900 dark:text-white">{value}</div></div>;
}

export function TimelineCard({ title, subtitle, text }: { title: string; subtitle: string; text: string }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"><p className="font-semibold text-slate-900 dark:text-white">{title}</p><p className="mt-1 text-xs text-slate-500">{subtitle}</p><p className="mt-2 text-slate-600 dark:text-slate-300">{text}</p></div>;
}

export function StatusBadge({ label }: { label: string }) {
  const classes = label === 'Non reçu'
    ? 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
    : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  return <span className={classes}>{label}</span>;
}

export function AccessBadge({ access }: { access?: DoctorPatient["access"] }) {
  if (access?.canWrite) {
    return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Ecriture</span>;
  }
  return <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Lecture</span>;
}

export function Empty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}
