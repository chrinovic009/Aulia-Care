import { useEffect, useMemo, useState } from "react";
import { ClientPagination, useClientPagination } from "../../components/common/ClientPagination";
import PageMeta from "../../components/common/PageMeta";
import { fetchMyPatientProfile, PatientProfile } from "../../api/patient";

const cdf = (value: string | number) => `${Number(value || 0).toLocaleString("fr-CD")} CDF`;
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const invoiceStatus = (status: string) => ({ PAID: "Payée", PARTIALLY_PAID: "Partiellement payée", PENDING: "Impayée", ISSUED: "À régler", CANCELLED: "Annulée" } as Record<string, string>)[status] || "État à confirmer";
const paymentMethod = (method?: string | null) => ({ CASH: "Espèces", MOBILE_MONEY: "Mobile Money", AIRTEL_MONEY: "Airtel Money", M_PESA: "M-Pesa", BANK_TRANSFER: "Virement bancaire", INSURANCE: "Prise en charge" } as Record<string, string>)[method || ""] || "Paiement enregistré";

export default function PatientPayments() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setProfile(await fetchMyPatientProfile());
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Impossible de charger vos factures.");
      }
    };
    void load();
    window.addEventListener("d7:invoice.updated", load);
    window.addEventListener("d7:payment.created", load);
    return () => {
      window.removeEventListener("d7:invoice.updated", load);
      window.removeEventListener("d7:payment.created", load);
    };
  }, []);

  const invoices = profile?.invoices || [];
  const invoicePagination = useClientPagination(invoices, 10);
  const totalDue = useMemo(() => invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.balanceDue)), 0), [invoices]);

  return (
    <div className="space-y-6">
      <PageMeta title="Paiements | Aulia Care" description="Factures et paiements du patient." />
      <section className="aulia-card p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-aulia-teal">Facturation sécurisée</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">Mes paiements et mes factures</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">Tous les montants sont en francs congolais. Une réduction négociée est visible seulement après approbation par la Finance ou l’Administration.</p>
        <div className="mt-5 rounded-2xl bg-aulia-navy p-4 text-white"><p className="text-sm text-white/75">Solde total à régler</p><p className="mt-1 text-3xl font-semibold">{cdf(totalDue)}</p></div>
      </section>

      {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}

      <section className="aulia-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Historique des factures</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Les paiements et réductions sont expliqués par leur état, sans afficher d’identifiant technique.</p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100 dark:border-white/10">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:text-slate-400"><tr><th className="px-3 py-3">Émise le</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Reste</th><th className="px-3 py-3">État</th><th className="px-3 py-3">Paiements</th><th className="px-3 py-3">Réduction</th></tr></thead>
            <tbody>{invoicePagination.pageItems.length ? invoicePagination.pageItems.map((invoice, index) => <tr key={invoice.id || index} className="border-b border-slate-100 align-top dark:border-white/10"><td className="px-3 py-4 text-slate-700 dark:text-slate-200">{dateTime(invoice.issuedAt)}</td><td className="px-3 py-4 font-medium text-slate-900 dark:text-white">{cdf(invoice.totalAmount)}</td><td className="px-3 py-4 text-slate-700 dark:text-slate-200">{cdf(invoice.balanceDue)}</td><td className="px-3 py-4"><span className="rounded-full bg-aulia-mist px-2.5 py-1 text-xs font-semibold text-aulia-teal dark:bg-aulia-teal/15">{invoiceStatus(invoice.status)}</span></td><td className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">{invoice.payments?.length ? invoice.payments.map((payment, paymentIndex) => <p key={paymentIndex}>{cdf(payment.amount)} · {paymentMethod(payment.method)} · {dateTime(payment.paidAt)}</p>) : "Aucun paiement enregistré"}</td><td className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">{invoice.discountRequests?.length ? invoice.discountRequests.map((discount, discountIndex) => <p key={discountIndex}>{cdf(discount.amount)} · {discount.status === "APPROVED" ? "Réduction approuvée" : "En cours de validation"}</p>) : "Aucune"}</td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500 dark:text-slate-400">Aucune facture dans votre dossier.</td></tr>}</tbody>
          </table>
        </div>
        <ClientPagination page={invoicePagination.page} totalItems={invoices.length} totalPages={invoicePagination.totalPages} onPageChange={invoicePagination.setPage} label="factures" />
      </section>

      <section className="rounded-2xl border border-aulia-teal/20 bg-aulia-mist/55 p-5 text-sm leading-6 text-slate-600 dark:bg-aulia-teal/10 dark:text-slate-300"><p className="font-semibold text-slate-900 dark:text-white">Paiement Mobile Money</p><p className="mt-1">Les numéros Orange, Airtel et Vodacom sont proposés uniquement lorsqu’ils ont été configurés et activés par l’administrateur de l’hôpital.</p></section>
    </div>
  );
}
