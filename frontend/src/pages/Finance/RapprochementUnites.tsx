import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../config/api";

type Line = {
  kind: "LABORATORY" | "IMAGING"; examId: string; exam: string; patient: string; requesterUnit: string; requestedAt: string;
  performed: boolean; examStatus: string; invoiceStatus: string | null; amount: number; balanceDue: number; ageDays: number;
  issue: "PERFORMED_UNPAID" | "UNPAID" | "NO_INVOICE" | null;
};
type Report = {
  since: string; lines: Line[];
  totals: { exams: number; billed: number; paid: number; covered: number; outstanding: number; performedUnpaid: number; performedUnpaidAmount: number; withoutInvoice: number; cancelled: number };
};

const money = (value: number) => `${value.toLocaleString("fr-FR")} CDF`;
const ISSUE_LABELS: Record<string, string> = { PERFORMED_UNPAID: "Réalisé, non payé", UNPAID: "Non payé", NO_INVOICE: "Sans facture" };
const INVOICE_LABELS: Record<string, string> = { PENDING: "En attente", PARTIALLY_PAID: "Partiellement payée", PAID: "Payée", COVERED: "Couverte (abonnement)", CANCELLED: "Annulée", ISSUED: "Émise" };

/**
 * Exams requested by care units (emergency, maternity, operating theatre...)
 * are performed before payment. Finance checks here that each one is billed
 * and settled, and follows up those performed but still unpaid.
 */
export default function RapprochementUnites() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<"ISSUES" | "ALL">("ISSUES");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    void apiFetch<Report>(`/billing/unit-exams/reconciliation?days=${days}`).then(setReport).catch((reason) => setError(reason instanceof Error ? reason.message : "Rapport indisponible."));
  }, [days]);
  useEffect(() => { load(); }, [load]);
  const lines = useMemo(() => (report?.lines ?? []).filter((line) => filter === "ALL" || line.issue), [report, filter]);
  const exportCsv = () => {
    if (!report) return;
    const rows = [["Type", "Examen", "Patient", "Unité", "Demandé le", "Réalisé", "Facture", "Montant", "Reste dû", "Âge (j)", "Écart"],
      ...report.lines.map((line) => [line.kind === "LABORATORY" ? "Laboratoire" : "Imagerie", line.exam, line.patient, line.requesterUnit, new Date(line.requestedAt).toLocaleDateString("fr-FR"), line.performed ? "oui" : "non", line.invoiceStatus ? INVOICE_LABELS[line.invoiceStatus] ?? line.invoiceStatus : "—", String(line.amount), String(line.balanceDue), String(line.ageDays), line.issue ? ISSUE_LABELS[line.issue] : ""])];
    const csv = "﻿" + rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `rapprochement-examens-unites-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
  };
  const card = (label: string, value: string, tone = "") => (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
  return (
    <section className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Finance</p>
          <h1 className="text-2xl font-bold text-aulia-navy dark:text-white">Rapprochement des examens des unités</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Les unités de soins (urgences, maternité, bloc…) font réaliser les examens avant le paiement. Chaque examen est rapproché de sa facture : vous suivez ici ceux qui sont réalisés mais pas encore payés.</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option><option value={365}>12 mois</option>
          </select>
          <button type="button" onClick={exportCsv} disabled={!report} className="rounded-xl bg-aulia-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Exporter (CSV)</button>
        </div>
      </header>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {report && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {card("Examens", String(report.totals.exams))}
          {card("Facturé", money(report.totals.billed))}
          {card("Payé / couvert", money(report.totals.paid + report.totals.covered))}
          {card("Reste dû", money(report.totals.outstanding), report.totals.outstanding ? "border-amber-300" : "")}
          {card("Réalisés non payés", `${report.totals.performedUnpaid} · ${money(report.totals.performedUnpaidAmount)}`, report.totals.performedUnpaid ? "border-red-300" : "")}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="font-semibold">{filter === "ISSUES" ? "Écarts à suivre" : "Tous les examens"}</h2>
          <div className="flex gap-1 text-sm">
            <button type="button" onClick={() => setFilter("ISSUES")} className={`rounded-lg px-3 py-1.5 ${filter === "ISSUES" ? "bg-aulia-teal/10 font-semibold text-aulia-teal" : ""}`}>Écarts</button>
            <button type="button" onClick={() => setFilter("ALL")} className={`rounded-lg px-3 py-1.5 ${filter === "ALL" ? "bg-aulia-teal/10 font-semibold text-aulia-teal" : ""}`}>Tout</button>
          </div>
        </div>
        {!report ? <p className="p-6 text-sm text-slate-500">Chargement…</p> : !lines.length ? <p className="p-6 text-sm text-slate-500">{filter === "ISSUES" ? "Aucun écart sur la période." : "Aucun examen demandé par une unité sur la période."}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-4 py-2">Examen</th><th className="px-4 py-2">Patient</th><th className="px-4 py-2">Unité</th><th className="px-4 py-2">Demandé</th><th className="px-4 py-2">Réalisé</th><th className="px-4 py-2">Facture</th><th className="px-4 py-2 text-right">Reste dû</th><th className="px-4 py-2">Écart</th></tr></thead>
              <tbody>{lines.map((line) => (
                <tr key={`${line.kind}-${line.examId}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2"><span className="text-xs text-slate-500">{line.kind === "LABORATORY" ? "Laboratoire" : "Imagerie"}</span><br />{line.exam}</td>
                  <td className="px-4 py-2">{line.patient}</td>
                  <td className="px-4 py-2">{line.requesterUnit}</td>
                  <td className="px-4 py-2">{new Date(line.requestedAt).toLocaleDateString("fr-FR")}<br /><span className="text-xs text-slate-500">il y a {line.ageDays} j</span></td>
                  <td className="px-4 py-2">{line.examStatus === "CANCELLED" ? "Annulé" : line.performed ? "Oui" : "Non"}</td>
                  <td className="px-4 py-2">{line.invoiceStatus ? INVOICE_LABELS[line.invoiceStatus] ?? line.invoiceStatus : "—"}</td>
                  <td className="px-4 py-2 text-right">{money(line.balanceDue)}</td>
                  <td className="px-4 py-2">{line.issue ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${line.issue === "PERFORMED_UNPAID" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{ISSUE_LABELS[line.issue]}</span> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
