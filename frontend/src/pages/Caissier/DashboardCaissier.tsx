import React, { useEffect, useMemo, useState } from "react";
import {
  applyInvoiceDiscount,
  authorizePatientDischarge,
  createPayment,
  fetchAllInvoices,
  fetchAllPayments,
  fetchPatientBillingSummary,
  fetchPatientsAwaitingPayment,
  PatientBillingSummary,
} from "../../api/cashier";

const fmt = (value: number | string | { toString: () => string }) => {
  const num = typeof value === "number" ? value : Number(value?.toString?.() ?? value);
  return Number.isFinite(num) ? num.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "0";
};

interface CashierPatient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  workflowStatus: string;
  arrivalAt: string;
  createdAt: string;
  service: string;
  serviceId: string;
  receptionist: string;
  invoice: {
    id: string;
    totalAmount: number;
    balanceDue: number;
    status: string;
    issuedAt: string;
    dueDate: string;
  } | null;
}

interface PaymentRecord {
  id: string;
  patientId: string;
  patientName: string;
  invoiceId: string;
  amount: number;
  method: string;
  paidAt: string;
  reference?: string;
  createdAt: string;
}

const DashboardCaissier: React.FC = () => {
  const [patients, setPatients] = useState<CashierPatient[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<Array<{ id: string; balanceDue?: number | string; status?: string; totalAmount?: number | string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"EN_ATTENTE_DE_PAIEMENT" | "EN_ATTENTE_VALIDATION_CAISSE" | "ALL">("ALL");
  const [authorizationPatient, setAuthorizationPatient] = useState<CashierPatient | null>(null);
  const [billingSummary, setBillingSummary] = useState<PatientBillingSummary | null>(null);
  const [discountInvoiceId, setDiscountInvoiceId] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [patientsData, paymentsData, invoicesData] = await Promise.all([
        fetchPatientsAwaitingPayment(),
        fetchAllPayments(),
        fetchAllInvoices(),
      ]);
      setPatients(patientsData);
      setPayments(paymentsData);
      setInvoices(invoicesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement des donnees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const filteredPatients = useMemo(() => {
    const list = filter === "ALL" ? patients : patients.filter((patient) => patient.workflowStatus === filter);
    return [...list].sort(
      (a, b) => new Date(b.arrivalAt || b.createdAt).getTime() - new Date(a.arrivalAt || a.createdAt).getTime(),
    );
  }, [patients, filter]);

  const totals = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const paymentsToday = payments.filter((payment) => payment.paidAt.slice(0, 10) === today);
    const totalCollected = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalCollectedToday = paymentsToday.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const totalOutstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0);
    const pendingCount = patients.filter((patient) => patient.workflowStatus === "EN_ATTENTE_DE_PAIEMENT").length;
    const validationCount = patients.filter((patient) => patient.workflowStatus === "EN_ATTENTE_VALIDATION_CAISSE").length;

    return {
      totalCollected,
      totalCollectedToday,
      totalOutstanding,
      paymentsTodayCount: paymentsToday.length,
      pendingCount,
      validationCount,
      totalCount: pendingCount + validationCount,
    };
  }, [payments, invoices, patients]);

  const handleProcessPayment = async (patient: CashierPatient) => {
    if (!patient.invoice) return;

    try {
      setProcessing(patient.id);
      await createPayment({
        invoiceId: patient.invoice.id,
        amount: Number(patient.invoice.balanceDue),
        method: "CASH",
        reference: `D7-${patient.firstName.charAt(0)}${patient.lastName.charAt(0)}-${Date.now()}`,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du traitement du paiement");
    } finally {
      setProcessing(null);
    }
  };

  const handleDeferPaymentToDischarge = async (patient: CashierPatient) => {
    try {
      setProcessing(patient.id);
      await updatePatientWorkflowStatus(patient.id, "EN_ATTENTE_INFIRMERIE");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du report du paiement");
    } finally {
      setProcessing(null);
    }
  };

  const openAuthorization = async (patient: CashierPatient) => {
    try {
      setProcessing(patient.id);
      setAuthorizationPatient(patient);
      const summary = await fetchPatientBillingSummary(patient.id);
      setBillingSummary(summary);
      setDiscountInvoiceId(summary.invoices.find((invoice) => Number(invoice.balanceDue) > 0)?.id || summary.invoices[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement de l'autorisation");
    } finally {
      setProcessing(null);
    }
  };

  const refreshAuthorization = async () => {
    if (!authorizationPatient) return;
    const summary = await fetchPatientBillingSummary(authorizationPatient.id);
    setBillingSummary(summary);
    setDiscountInvoiceId(summary.invoices.find((invoice) => Number(invoice.balanceDue) > 0)?.id || summary.invoices[0]?.id || "");
  };

  const handleApplyDiscount = async () => {
    if (!discountInvoiceId || !discountAmount) return;
    try {
      setProcessing(discountInvoiceId);
      await applyInvoiceDiscount(discountInvoiceId, Number(discountAmount), discountReason);
      setDiscountAmount("");
      setDiscountReason("");
      await refreshAuthorization();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la reduction");
    } finally {
      setProcessing(null);
    }
  };

  const handleAuthorizeDischarge = async () => {
    if (!authorizationPatient) return;
    try {
      setProcessing(authorizationPatient.id);
      await authorizePatientDischarge(authorizationPatient.id);
      setAuthorizationPatient(null);
      setBillingSummary(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'autorisation de sortie");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center p-4 sm:p-6">
        <div className="text-lg text-gray-600">Chargement des donnees...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
        <Metric label="Total encaisse" value={`${fmt(totals.totalCollected)} CDF`} />
        <Metric label="Aujourd'hui" value={`${fmt(totals.totalCollectedToday)} CDF`} hint={`${totals.paymentsTodayCount} paiement(s)`} />
        <Metric label="En attente paiement" value={String(totals.pendingCount)} tone="orange" />
        <Metric label="Autorisations sortie" value={String(totals.validationCount)} tone="blue" />
        <Metric label="Reste a recouvrer" value={`${fmt(totals.totalOutstanding)} CDF`} tone="red" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterButton active={filter === "ALL"} onClick={() => setFilter("ALL")}>Tous ({totals.totalCount})</FilterButton>
        <FilterButton active={filter === "EN_ATTENTE_DE_PAIEMENT"} onClick={() => setFilter("EN_ATTENTE_DE_PAIEMENT")}>Paiements ({totals.pendingCount})</FilterButton>
        <FilterButton active={filter === "EN_ATTENTE_VALIDATION_CAISSE"} onClick={() => setFilter("EN_ATTENTE_VALIDATION_CAISSE")}>Autorisations ({totals.validationCount})</FilterButton>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <section>
          <h2 className="mb-3 text-lg font-medium">Dossiers caisse</h2>
          <div className="max-h-[680px] space-y-2 overflow-y-auto">
            {filteredPatients.length === 0 ? (
              <div className="rounded bg-white p-4 text-center text-sm text-gray-600">Aucun dossier en attente.</div>
            ) : (
              filteredPatients.map((patient) => (
                <article key={patient.id} className="rounded border-2 border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-lg font-bold">{patient.firstName} {patient.lastName}</div>
                      <div className="mt-1 text-sm text-gray-600">Service: {patient.service} - Tel: {patient.phone || "-"}</div>
                      <div className="mt-2 text-sm">
                        {patient.invoice ? (
                          <>
                            <span className="font-semibold">Facture admission: {fmt(patient.invoice.totalAmount)} CDF</span>
                            <span className="ml-3 rounded bg-red-100 px-2 py-1 text-xs text-red-800">
                              Reste: {fmt(patient.invoice.balanceDue)} CDF
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-500">Aucune facture admission</span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">Arrivee: {new Date(patient.arrivalAt || patient.createdAt).toLocaleString("fr-FR")}</div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {patient.workflowStatus === "EN_ATTENTE_DE_PAIEMENT" ? (
                        <>
                          <button
                            onClick={() => handleProcessPayment(patient)}
                            disabled={!patient.invoice || processing === patient.id}
                            className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {processing === patient.id ? "Traitement..." : "Traiter paiement"}
                          </button>
                          <button
                            onClick={() => handleDeferPaymentToDischarge(patient)}
                            disabled={processing === patient.id}
                            className="rounded border px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                          >
                            Reporter a la sortie
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => openAuthorization(patient)}
                          disabled={processing === patient.id}
                          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {processing === patient.id ? "Chargement..." : "Autorisation sortie"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-medium">Paiements recents</h2>
          <div className="max-h-[500px] overflow-y-auto rounded bg-white p-2 shadow">
            {payments.slice(0, 20).map((payment) => (
              <div key={payment.id} className="flex justify-between border-b py-2 last:border-b-0">
                <div>
                  <div className="text-sm font-medium">{payment.patientName}</div>
                  <div className="text-xs text-gray-500">{payment.method} - {payment.reference || "-"}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{fmt(payment.amount)} CDF</div>
                  <div className="text-xs text-gray-500">{new Date(payment.createdAt).toLocaleTimeString("fr-FR")}</div>
                </div>
              </div>
            ))}
            {payments.length === 0 && <div className="p-3 text-sm text-gray-600">Aucun paiement recent.</div>}
          </div>
        </section>
      </div>

      {authorizationPatient && billingSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Autorisation de sortie</p>
                <h2 className="text-xl font-bold">{billingSummary.patient.name}</h2>
                <p className="text-sm text-slate-600">{billingSummary.patient.phone || "Telephone non renseigne"}</p>
              </div>
              <button onClick={() => setAuthorizationPatient(null)} className="rounded border px-3 py-2 text-sm">Fermer</button>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Total factures" value={`${fmt(billingSummary.totalAmount)} CDF`} />
              <Metric label="Total paye" value={`${fmt(billingSummary.totalPaid)} CDF`} tone="green" />
              <Metric label="Reste a payer" value={`${fmt(billingSummary.balanceDue)} CDF`} tone="red" />
            </div>

            <div className="overflow-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 text-left">Facture</th>
                    <th className="p-3 text-right">Montant</th>
                    <th className="p-3 text-right">Paye</th>
                    <th className="p-3 text-right">Reste</th>
                    <th className="p-3 text-left">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {billingSummary.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t">
                      <td className="p-3">{invoice.type}</td>
                      <td className="p-3 text-right">{fmt(invoice.totalAmount)} CDF</td>
                      <td className="p-3 text-right text-green-700">{fmt(invoice.paidAmount)} CDF</td>
                      <td className="p-3 text-right text-red-700">{fmt(invoice.balanceDue)} CDF</td>
                      <td className="p-3">{invoice.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded border bg-slate-50 p-4">
              <h3 className="mb-3 font-semibold">Reduction apres discussion avec le patient</h3>
              <div className="grid gap-3 md:grid-cols-[1fr_160px_1.5fr_auto]">
                <select value={discountInvoiceId} onChange={(e) => setDiscountInvoiceId(e.target.value)} className="rounded border px-3 py-2 text-sm">
                  {billingSummary.invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>{invoice.type} - reste {fmt(invoice.balanceDue)} CDF</option>
                  ))}
                </select>
                <input value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="Montant" className="rounded border px-3 py-2 text-sm" />
                <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Motif" className="rounded border px-3 py-2 text-sm" />
                <button onClick={handleApplyDiscount} className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Appliquer</button>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleAuthorizeDischarge}
                disabled={billingSummary.balanceDue > 0 || processing === authorizationPatient.id}
                className="rounded bg-green-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {billingSummary.balanceDue > 0 ? "Solde non regle" : "Autoriser la sortie"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function Metric({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "green" | "orange" | "blue" | "red" }) {
  const colors = {
    default: "text-slate-900",
    green: "text-green-700",
    orange: "text-orange-700",
    blue: "text-blue-700",
    red: "text-red-700",
  };
  return (
    <div className="rounded bg-white p-3 text-center shadow">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${colors[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-gray-600">{hint}</div>}
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded px-4 py-2 text-sm ${active ? "bg-slate-900 text-white" : "border bg-white"}`}>
      {children}
    </button>
  );
}

export default DashboardCaissier;
