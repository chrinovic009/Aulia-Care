import React, { useEffect, useState, useMemo } from "react";
import { fetchAllPayments, fetchAllInvoices } from "../../api/cashier";
import { HistoryPrintTemplate } from "./HistoryPrintTemplate";

interface HistoryRecord {
  id: string;
  type: "payment" | "invoice";
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  amount: number;
  status?: string;
  method?: string;
  reference?: string;
  createdAt: string;
  invoiceType?: string;
}

const HistoriqueCaissier: React.FC = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "PAYMENT" | "INVOICE">("ALL");
  const [dateRange, setDateRange] = useState<"ALL" | "TODAY" | "WEEK" | "MONTH">("ALL");
  const [printingData, setPrintingData] = useState<HistoryRecord[] | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [paymentsData, invoicesData] = await Promise.all([fetchAllPayments(), fetchAllInvoices()]);
      setPayments(paymentsData);
      setInvoices(invoicesData);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement de l'historique";
      setError(message);
      console.error("Error loading history data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const combined = useMemo((): HistoryRecord[] => {
    const combined: HistoryRecord[] = [
      ...payments.map((p) => ({
        id: p.id,
        type: "payment" as const,
        patientName: p.patientName,
        patientPhone: p.patientPhone,
        patientEmail: p.patientEmail,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        createdAt: p.createdAt,
      })),
      ...invoices.map((i) => ({
        id: i.id,
        type: "invoice" as const,
        patientName: i.patientName,
        patientPhone: i.patientPhone,
        patientEmail: i.patientEmail,
        amount: i.totalAmount,
        status: i.status,
        invoiceType: i.type,
        createdAt: i.createdAt,
      })),
    ];

    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [payments, invoices]);

  const filtered = useMemo(() => {
    let results = combined;

    // Filter by type
    if (filterType !== "ALL") {
      results = results.filter((r) => r.type === filterType.toLowerCase());
    }

    // Filter by date range
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());

    if (dateRange === "TODAY") {
      results = results.filter((r) => new Date(r.createdAt) >= today);
    } else if (dateRange === "WEEK") {
      results = results.filter((r) => new Date(r.createdAt) >= weekAgo);
    } else if (dateRange === "MONTH") {
      results = results.filter((r) => new Date(r.createdAt) >= monthAgo);
    }

    // Filter by search query
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (r) =>
          (r.patientName || "").toLowerCase().includes(q) ||
          (r.patientPhone || "").toLowerCase().includes(q) ||
          (r.reference || "").toLowerCase().includes(q) ||
          (r.id || "").toLowerCase().includes(q)
      );
    }

    return results;
  }, [combined, filterType, dateRange, query]);

  const totals = useMemo(() => {
    const paymentsTotalAmount = filtered
      .filter((r) => r.type === "payment")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const invoicesTotalAmount = filtered
      .filter((r) => r.type === "invoice")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const paymentsCount = filtered.filter((r) => r.type === "payment").length;
    const invoicesCount = filtered.filter((r) => r.type === "invoice").length;

    return {
      paymentsTotalAmount,
      invoicesTotalAmount,
      paymentsCount,
      invoicesCount,
      totalRecords: filtered.length,
    };
  }, [filtered]);

  const handlePrintHistory = () => {
    setPrintingData(filtered);
    setTimeout(() => {
      window.print();
      setPrintingData(null);
    }, 150);
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Chargement de l'historique...</div>
      </div>
    );
  }

  return (
    <>
    <style>
      {`
        @media screen {
          #history-print-area { display: none; }
        }
        @media print {
          body { margin: 0; padding: 0; background: #fff; }
          #main-content { display: none !important; }
          #history-print-area { display: block !important; }
        }
      `}
    </style>
    <div id="main-content">
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Historique financier</h1>
        <button
          onClick={handlePrintHistory}
          className="px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-800 text-sm"
        >
          📄 Imprimer l'historique
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Paiements</div>
          <div className="text-xl font-bold text-green-600">{totals.paymentsCount}</div>
          <div className="text-sm text-gray-700">{totals.paymentsTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })} USD</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Factures</div>
          <div className="text-xl font-bold text-orange-600">{totals.invoicesCount}</div>
          <div className="text-sm text-gray-700">{totals.invoicesTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })} USD</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Total</div>
          <div className="text-xl font-bold">{totals.totalRecords}</div>
          <div className="text-sm text-gray-700">
            {(totals.paymentsTotalAmount + totals.invoicesTotalAmount).toLocaleString(undefined, { minimumFractionDigits: 0 })} USD
          </div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Solde net</div>
          <div className={`text-xl font-bold ${totals.paymentsTotalAmount >= totals.invoicesTotalAmount ? "text-green-600" : "text-red-600"}`}>
            {(totals.paymentsTotalAmount - totals.invoicesTotalAmount).toLocaleString(undefined, { minimumFractionDigits: 0 })} USD
          </div>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <div>
          <input
            placeholder="Rechercher transaction, patient, référence, ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType("ALL")}
              className={`px-4 py-2 rounded text-sm ${filterType === "ALL" ? "bg-slate-900 text-white" : "bg-white border"}`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilterType("PAYMENT")}
              className={`px-4 py-2 rounded text-sm ${filterType === "PAYMENT" ? "bg-green-600 text-white" : "bg-white border"}`}
            >
              Paiements ({payments.length})
            </button>
            <button
              onClick={() => setFilterType("INVOICE")}
              className={`px-4 py-2 rounded text-sm ${filterType === "INVOICE" ? "bg-orange-600 text-white" : "bg-white border"}`}
            >
              Factures ({invoices.length})
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setDateRange("TODAY")}
              className={`px-4 py-2 rounded text-sm ${dateRange === "TODAY" ? "bg-blue-600 text-white" : "bg-white border"}`}
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => setDateRange("WEEK")}
              className={`px-4 py-2 rounded text-sm ${dateRange === "WEEK" ? "bg-blue-600 text-white" : "bg-white border"}`}
            >
              Cette semaine
            </button>
            <button
              onClick={() => setDateRange("MONTH")}
              className={`px-4 py-2 rounded text-sm ${dateRange === "MONTH" ? "bg-blue-600 text-white" : "bg-white border"}`}
            >
              Ce mois
            </button>
            <button
              onClick={() => setDateRange("ALL")}
              className={`px-4 py-2 rounded text-sm ${dateRange === "ALL" ? "bg-blue-600 text-white" : "bg-white border"}`}
            >
              Tous les temps
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">Date & Heure</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Patient</th>
              <th className="p-3 text-left">Téléphone</th>
              <th className="p-3 text-left">Méthode/Type</th>
              <th className="p-3 text-left">Référence</th>
              <th className="p-3 text-right">Montant (USD)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-sm text-gray-600 text-center">
                  Aucun historique trouvé.
                </td>
              </tr>
            ) : (
              filtered.map((record) => (
                <tr key={record.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 text-sm">
                    <div>{new Date(record.createdAt).toLocaleDateString("fr-FR")}</div>
                    <div className="text-xs text-gray-500">{new Date(record.createdAt).toLocaleTimeString("fr-FR")}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        record.type === "payment"
                          ? "bg-green-100 text-green-800"
                          : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {record.type === "payment" ? "PAIEMENT" : "FACTURE"}
                    </span>
                  </td>
                  <td className="p-3 font-medium">{record.patientName}</td>
                  <td className="p-3 text-sm">{record.patientPhone || "—"}</td>
                  <td className="p-3 text-sm">{record.method || record.invoiceType || "—"}</td>
                  <td className="p-3 text-sm">{record.reference || "—"}</td>
                  <td className="p-3 text-right font-medium">
                    {record.amount.toLocaleString(undefined, { minimumFractionDigits: 0 })} USD
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Hidden print area */}
      </div>
    </div>
    <div id="history-print-area">
      {printingData && <HistoryPrintTemplate records={printingData} />}
    </div>
    </>
  );
};

export default HistoriqueCaissier;

