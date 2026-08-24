import { useCallback, useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { ClientPagination, useClientPagination } from "../../components/common/ClientPagination";
import { fetchFinanceDashboard, FinanceDashboard } from "../../api/finance";
import { useRealtime } from "../../context/RealtimeContext";

const cdf = (value: number) => new Intl.NumberFormat("fr-CD", { style: "currency", currency: "CDF", maximumFractionDigits: 0 }).format(Number(value || 0));
const percentage = (value: number) => `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`;

function Kpi({ label, value, description, tone = "teal" }: { label: string; value: string; description: string; tone?: "teal" | "navy" | "amber" | "rose" }) {
  const tones = { teal: "border-aulia-teal/25 bg-aulia-teal/10 dark:border-aulia-teal/40 dark:bg-aulia-teal/15", navy: "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60", amber: "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/25", rose: "border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/25" };
  return <article className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}><p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p><p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p></article>;
}

export default function DashboardFinance() {
  const { socket } = useRealtime();
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setError(null); setLoading(true); setData(await fetchFinanceDashboard()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Impossible de charger le pilotage financier."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refreshFinance = () => void load();
    const refreshBilling = (event?: { model?: string }) => {
      if (["Invoice", "InvoiceLine", "Payment", "Revenue", "Expense", "CashRegister", "InvoiceDiscountRequest", "SupplierInvoice", "SupplierPayment", "Payroll"].includes(String(event?.model || ""))) void load();
    };
    socket?.on("finance.updated", refreshFinance);
    socket?.on("realtime.update", refreshBilling);
    return () => { socket?.off("finance.updated", refreshFinance); socket?.off("realtime.update", refreshBilling); };
  }, [socket, load]);
  const maxCashFlow = useMemo(() => Math.max(1, ...(data?.cashFlow.flatMap((point) => [point.inflows, point.outflows]) || [1])), [data]);
  const alerts = useMemo(() => [
    ...(data?.alerts.supplierInvoices || []).map((alert) => ({ id: `supplier-${alert.id}`, title: alert.label, detail: `${cdf(alert.amount)} à régler${alert.dueDate ? ` · échéance ${new Date(alert.dueDate).toLocaleDateString("fr-FR")}` : ""}`, tone: "amber" })),
    ...(data?.alerts.budgetOverruns || []).map((alert) => ({ id: `budget-${alert.id}`, title: `Budget dépassé : ${alert.label}`, detail: `${cdf(alert.consumedAmount)} consommés pour ${cdf(alert.allocatedAmount)} alloués`, tone: "rose" })),
    ...(data?.alerts.insuranceRejections || []).map((alert) => ({ id: `claim-${alert.id}`, title: `Rejet assurance : ${alert.patient}`, detail: `${cdf(alert.amount)} · ${alert.reason}`, tone: "rose" })),
  ], [data]);
  const alertPagination = useClientPagination(alerts, 5);
  const revenueTotal = useMemo(() => (data?.revenueByPole || []).reduce((sum, item) => sum + item.value, 0), [data]);

  return <main className="mx-auto w-full max-w-[1540px] space-y-5 px-3 pb-8 pt-2 sm:px-5 lg:px-7">
    <PageMeta title="Finance | Aulia Care" description="Pilotage financier hospitalier sécurisé" />
    <PageBreadcrumb pageTitle="Pilotage financier" />
    <section className="overflow-hidden rounded-3xl border border-teal-800/20 bg-gradient-to-r from-slate-950 via-slate-900 to-teal-800 px-5 py-6 text-white shadow-lg sm:px-7"><p className="text-sm font-medium text-teal-200">Aulia Care · Direction financière</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Tableau de bord exécutif</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">Données issues des écritures opérationnelles enregistrées. Toute valeur non rapprochée par la banque reste une estimation de trésorerie, jamais un solde bancaire certifié.</p></section>
    {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}<button onClick={() => void load()} className="ml-3 rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white">Réessayer</button></div> : null}
    {loading && !data ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Chargement des écritures financières…</div> : null}
    {data ? <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Trésorerie opérationnelle estimée" value={cdf(data.kpis.operationalCashEstimate)} description="Encaissements moins sorties connues. Rapprochement bancaire requis." tone="teal" /><Kpi label="Chiffre d’affaires du mois" value={cdf(data.kpis.monthlyRevenue)} description={`Mois précédent : ${cdf(data.kpis.previousMonthRevenue)} · N-1 : ${cdf(data.kpis.previousYearRevenue)}${data.kpis.revenueObjective ? ` · objectif : ${cdf(data.kpis.revenueObjective)}` : " · objectif non défini"}.`} tone="navy" /><Kpi label="Reste à recouvrer" value={cdf(data.kpis.receivables)} description={`${cdf(data.kpis.urgentReceivables)} ont plus de 90 jours.`} tone="amber" /><Kpi label="Marge nette opérationnelle" value={percentage(data.kpis.netMarginPercent)} description="Basée sur les revenus et sorties actuellement imputées." tone={data.kpis.netMarginPercent < 0 ? "rose" : "teal"} /></section>
      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.95fr]"><article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900 dark:text-white">Flux de trésorerie · 12 mois</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Entrées et sorties enregistrées, en CDF.</p></div><button onClick={() => void load()} className="rounded-xl border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 dark:border-teal-900 dark:text-teal-200">Actualiser</button></div><div className="mt-6 flex h-56 min-w-[600px] items-end gap-3 overflow-x-auto pb-6">{data.cashFlow.map((point) => <div key={point.month} className="flex min-w-[48px] flex-1 flex-col items-center gap-2"><div className="flex h-44 items-end gap-1"><span title={`Entrées ${cdf(point.inflows)}`} className="w-4 rounded-t bg-teal-600" style={{ height: `${Math.max(3, point.inflows / maxCashFlow * 100)}%` }} /><span title={`Sorties ${cdf(point.outflows)}`} className="w-4 rounded-t bg-slate-700 dark:bg-slate-300" style={{ height: `${Math.max(3, point.outflows / maxCashFlow * 100)}%` }} /></div><span className="text-[10px] text-slate-500">{point.month.slice(5)}</span></div>)}</div><div className="flex gap-4 text-xs text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-600" />Entrées</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-700 dark:bg-slate-300" />Sorties</span></div></article><article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">Répartition des revenus</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Facturation du mois courant.</p><div className="mt-5 space-y-4">{data.revenueByPole.length ? data.revenueByPole.map((item) => <div key={item.name}><div className="flex justify-between gap-3 text-sm"><span className="font-medium text-slate-700 dark:text-slate-200">{item.name}</span><span className="text-slate-500">{cdf(item.value)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-teal-600" style={{ width: `${revenueTotal ? Math.max(2, item.value / revenueTotal * 100) : 0}%` }} /></div></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800">Aucune facture du mois à répartir.</p>}</div></article></section>
      <section className="grid gap-5 lg:grid-cols-[1fr_1.2fr]"><article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">Qualité des données</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{data.dataQuality.note}</p><p className="mt-3 text-xs font-medium text-teal-700 dark:text-teal-300">Les relances et validations restent journalisées dans les modules concernés.</p></article><article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">Alertes financières rapides</h2><div className="mt-4 space-y-3">{alertPagination.pageItems.length ? alertPagination.pageItems.map((alert) => <div key={alert.id} className={`rounded-2xl border p-4 ${alert.tone === "rose" ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"}`}><p className="font-semibold text-slate-900 dark:text-white">{alert.title}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{alert.detail}</p></div>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800">Aucune alerte financière urgente détectée.</p>}</div><ClientPagination page={alertPagination.page} totalPages={alertPagination.totalPages} totalItems={alerts.length} pageSize={5} onPageChange={alertPagination.setPage} label="alertes" /></article></section>
    </> : null}
  </main>;
}
