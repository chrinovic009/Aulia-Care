import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

type Forecast = { months: Array<{ month: string; billed: number; outstanding: number }>; forecastNextMonth: number; outstandingBalance: number; method: string };
const cdf = (value: number) => new Intl.NumberFormat("fr-CD", { style: "currency", currency: "CDF", maximumFractionDigits: 0 }).format(value || 0);

export default function DashboardFinance() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { apiFetch<Forecast>("/billing/forecast").then(setForecast).catch((e) => setError(e instanceof Error ? e.message : "Impossible de charger les données financières.")); }, []);
  const latest = forecast?.months.at(-1);
  const recoveryRate = useMemo(() => latest?.billed ? Math.max(0, Math.round((1 - latest.outstanding / latest.billed) * 100)) : 0, [latest]);
  return <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
    <PageMeta title="Finance | Aulia Care" description="Pilotage financier hospitalier" />
    <PageBreadcrumb pageTitle="Finance & comptabilité" />
    <section className="rounded-xl bg-slate-900 p-6 text-white"><p className="text-sm text-slate-300">Aulia Care · Finance</p><h1 className="mt-1 text-2xl font-semibold">Pilotage financier et comptable</h1><p className="mt-2 text-sm text-slate-300">Montants en francs congolais (CDF). Les prévisions sont des aides à la décision.</p></section>
    {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 grid gap-4 md:grid-cols-3"><Metric label="Facturé ce mois" value={cdf(latest?.billed || 0)} /><Metric label="Encours à recouvrer" value={cdf(forecast?.outstandingBalance || 0)} tone="amber" /><Metric label="Prévision prochain mois" value={cdf(forecast?.forecastNextMonth || 0)} tone="emerald" /></div>
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">Suivi mensuel</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="text-left text-slate-500"><tr><th className="pb-3">Mois</th><th className="pb-3">Facturé</th><th className="pb-3">Encours</th><th className="pb-3">Recouvrement</th></tr></thead><tbody>{(forecast?.months || []).map((month) => <tr key={month.month} className="border-t border-slate-100 dark:border-slate-800"><td className="py-3">{month.month}</td><td>{cdf(month.billed)}</td><td>{cdf(month.outstanding)}</td><td>{month.billed ? `${Math.max(0, Math.round((1 - month.outstanding / month.billed) * 100))}%` : "—"}</td></tr>)}</tbody></table></div><p className="mt-4 text-xs text-slate-500">{forecast?.method || "Chargement des prévisions…"}</p></section>
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 text-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">Contrôles comptables</h2><ul className="mt-3 space-y-2 text-slate-600 dark:text-slate-300"><li>• Recouvrement du mois : {recoveryRate}%.</li><li>• Factures, paiements et dépenses restent traçables dans les modules Caisse et Administration.</li><li>• Toute réduction négociée doit recevoir l’approbation administrateur avant encaissement.</li></ul></section>
  </div>;
}
function Metric({ label, value, tone = "blue" }: { label: string; value: string; tone?: "blue" | "amber" | "emerald" }) { const colors = { blue: "border-blue-200 text-blue-700", amber: "border-amber-200 text-amber-700", emerald: "border-emerald-200 text-emerald-700" }; return <div className={`rounded-xl border bg-white p-5 dark:bg-slate-900 ${colors[tone]}`}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>; }
