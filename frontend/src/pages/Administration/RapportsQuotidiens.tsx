import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Ambulance, Banknote, ChevronLeft, ChevronRight, FlaskConical, HandCoins, HeartPulse, IdCard, Pill, Printer, ScanLine, Stethoscope, Users, type LucideIcon } from "lucide-react";
import { apiFetch } from "../../config/api";
import { formatDuration } from "../../api/hr";

type Metric = { key: string; label: string; value: number; format: "count" | "money" | "duration"; tone?: "good" | "warn" | "bad" };
type Section = { title: string; columns: string[]; rows: Array<Array<string | number>> };
type ReportData = { metrics: Metric[]; sections: Section[]; highlights: string[] };
type DayReport = { day: string; live: boolean; generatedAt: string; data: ReportData };
type Page = { service: string; label: string; page: number; pages: number; total: number; reports: DayReport[]; services: Array<{ code: string; label: string }> };
type Period = { label: string; from: string; to: string; days: number; totals: Metric[]; series: Array<{ day: string; metrics: Record<string, number> }> };

const ICONS: Record<string, LucideIcon> = {
  RECEPTION: Users, CASHIER: HandCoins, NURSING: HeartPulse, MEDICAL: Stethoscope, LABORATORY: FlaskConical, IMAGING: ScanLine,
  PHARMACY: Pill, CARE_UNITS: Ambulance, FINANCE: Banknote, HUMAN_RESOURCES: IdCard,
};
const TONE: Record<string, string> = {
  good: "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
  warn: "border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
  bad: "border-red-200 bg-red-50/70 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
  none: "border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
};
const valueOf = (metric: Metric) => metric.format === "money" ? metric.value.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : metric.format === "duration" ? formatDuration(metric.value) : metric.value.toLocaleString("fr-FR");
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Daily reports of every service, archived each night: the administration
 * pages through the days or reads a whole week or month.
 */
export default function RapportsQuotidiens() {
  const [service, setService] = useState("RECEPTION");
  const [mode, setMode] = useState<"days" | "week" | "month">("days");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    if (mode === "days") {
      apiFetch<Page>(`/reports/daily/${service}?page=${page}&pageSize=5`).then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "Rapports indisponibles.")).finally(() => setLoading(false));
    } else {
      const to = new Date(); to.setDate(to.getDate() - 1);
      const from = new Date(to); from.setDate(from.getDate() - (mode === "week" ? 6 : 29));
      apiFetch<Period>(`/reports/daily/${service}/period?from=${iso(from)}&to=${iso(to)}`).then(setPeriod).catch((reason) => setError(reason instanceof Error ? reason.message : "Rapports indisponibles.")).finally(() => setLoading(false));
    }
  }, [mode, page, service]);
  useEffect(() => { load(); }, [load]);

  const services = data?.services ?? Object.keys(ICONS).map((code) => ({ code, label: code }));
  return (
    <section className="space-y-5 p-4 sm:p-6 print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Administration</p>
          <h1 className="text-2xl font-bold text-aulia-navy dark:text-white">Rapports quotidiens des services</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Chaque nuit, Aulia Care archive le rapport de la veille de chaque service. La journée en cours est calculée en direct.</p>
        </div>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 print:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><Printer className="size-4" /> Imprimer</button>
      </header>

      <nav className="flex gap-2 overflow-x-auto pb-1 print:hidden" aria-label="Services">
        {services.map((item) => {
          const Icon = ICONS[item.code] ?? Activity;
          const active = item.code === service;
          return (
            <button key={item.code} type="button" onClick={() => { setService(item.code); setPage(1); }} className={`inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-semibold ${active ? "border-aulia-teal bg-aulia-teal text-white shadow-lg shadow-aulia-teal/20" : "border-slate-200 bg-white text-slate-600 hover:border-aulia-teal/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"}`}>
              <Icon className="size-4" /> {item.label}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-slate-100 p-1 text-sm print:hidden dark:bg-slate-800/60" role="tablist">
        {([["days", "Jour par jour"], ["week", "7 derniers jours"], ["month", "30 derniers jours"]] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className={`rounded-xl px-4 py-1.5 font-semibold ${mode === value ? "bg-white text-aulia-navy shadow dark:bg-slate-900 dark:text-white" : "text-slate-500"}`}>{label}</button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && !data && !period && <p className="text-sm text-slate-500">Chargement des rapports…</p>}

      {mode === "days" && data && (
        <>
          {data.reports.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Aucun rapport archivé pour ce service pour l’instant : le premier sera produit cette nuit.</p>}
          <div className="space-y-5">{data.reports.map((report) => <DayCard key={report.day} report={report} />)}</div>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} total={data.total} />
        </>
      )}
      {mode !== "days" && period && <PeriodView period={period} />}
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <div key={metric.key} className={`rounded-2xl border p-3.5 ${TONE[metric.tone ?? "none"]}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{metric.label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{valueOf(metric)}</p>
        </div>
      ))}
    </div>
  );
}

function DayCard({ report }: { report: DayReport }) {
  const [open, setOpen] = useState(report.live);
  const exportCsv = () => {
    const lines = [["Indicateur", "Valeur"], ...report.data.metrics.map((metric) => [metric.label, valueOf(metric)]), [], ...report.data.sections.flatMap((section) => [[section.title], section.columns, ...section.rows.map((row) => row.map(String)), []])];
    const csv = "﻿" + lines.map((line) => line.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `rapport-${report.day}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:break-inside-avoid">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-aulia-mist to-white px-5 py-4 dark:border-slate-800 dark:from-aulia-teal/10 dark:to-slate-900">
        <div>
          <h2 className="text-lg font-bold capitalize text-aulia-navy dark:text-white">{dayLabel(report.day)}</h2>
          <p className="text-xs text-slate-500">{report.live ? "Journée en cours — chiffres en direct" : `Archivé le ${new Date(report.generatedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {report.live && <span className="rounded-full bg-aulia-teal/10 px-3 py-1 text-xs font-bold text-aulia-teal">En cours</span>}
          <button type="button" onClick={exportCsv} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">CSV</button>
          <button type="button" onClick={() => setOpen(!open)} className="rounded-xl bg-aulia-navy px-3 py-1.5 text-xs font-semibold text-white" aria-expanded={open}>{open ? "Réduire" : "Détail"}</button>
        </div>
      </header>
      <div className="space-y-4 p-5">
        <MetricGrid metrics={report.data.metrics} />
        {report.data.highlights.length > 0 && <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">{report.data.highlights.map((line, index) => <li key={index} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-aulia-teal" />{line}</li>)}</ul>}
        {open && report.data.sections.map((section) => (
          <div key={section.title} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">{section.title}</h3>
            {section.rows.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">Rien à signaler.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr>{section.columns.map((column) => <th key={column} className="px-4 py-2">{column}</th>)}</tr></thead>
                <tbody>{section.rows.map((row, index) => <tr key={index} className="border-t border-slate-100 dark:border-slate-800">{row.map((cell, at) => <td key={at} className="px-4 py-2 tabular-nums">{typeof cell === "number" ? cell.toLocaleString("fr-FR") : cell}</td>)}</tr>)}</tbody>
              </table></div>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  if (pages <= 1 && total <= 5) return null;
  const numbers = Array.from({ length: pages }, (_, index) => index + 1).filter((value) => value === 1 || value === pages || Math.abs(value - page) <= 1);
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 print:hidden" aria-label="Pagination des rapports">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700"><ChevronLeft className="size-4" /> Plus récents</button>
      {numbers.map((value, index) => (
        <span key={value} className="flex items-center gap-1.5">
          {index > 0 && value - numbers[index - 1] > 1 && <span className="text-slate-400">…</span>}
          <button type="button" onClick={() => onChange(value)} aria-current={value === page ? "page" : undefined} className={`min-w-9 rounded-xl px-3 py-1.5 text-sm font-semibold ${value === page ? "bg-aulia-teal text-white" : "border border-slate-300 dark:border-slate-700"}`}>{value}</button>
        </span>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-700">Plus anciens <ChevronRight className="size-4" /></button>
      <span className="w-full text-center text-xs text-slate-500">{total} jour(s) archivé(s)</span>
    </nav>
  );
}

function PeriodView({ period }: { period: Period }) {
  const [metricKey, setMetricKey] = useState(period.totals[0]?.key ?? "");
  useEffect(() => { setMetricKey(period.totals[0]?.key ?? ""); }, [period]);
  const max = useMemo(() => Math.max(1, ...period.series.map((point) => point.metrics[metricKey] ?? 0)), [metricKey, period.series]);
  const selected = period.totals.find((metric) => metric.key === metricKey);
  if (!period.days) return <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Aucun jour archivé sur cette période.</p>;
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600 dark:text-slate-300">{period.label} · du {new Date(`${period.from}T12:00:00`).toLocaleDateString("fr-FR")} au {new Date(`${period.to}T12:00:00`).toLocaleDateString("fr-FR")} · {period.days} jour(s) archivé(s)</p>
      <MetricGrid metrics={period.totals} />
      <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-aulia-navy dark:text-white">Évolution jour par jour</h2>
          <select value={metricKey} onChange={(event) => setMetricKey(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900">
            {period.totals.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
          </select>
        </div>
        <div className="flex h-48 items-end gap-1.5" role="img" aria-label={`Évolution : ${selected?.label ?? ""}`}>
          {period.series.map((point) => {
            const value = point.metrics[metricKey] ?? 0;
            return (
              <div key={point.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100">{selected ? valueOf({ ...selected, value }) : value}</span>
                <div className="w-full origin-bottom rounded-t-lg bg-gradient-to-t from-aulia-teal to-teal-300 transition-all duration-700" style={{ height: `${Math.max(2, (value / max) * 100)}%` }} title={`${point.day} : ${value}`} />
                <span className="text-[10px] text-slate-400">{point.day.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
