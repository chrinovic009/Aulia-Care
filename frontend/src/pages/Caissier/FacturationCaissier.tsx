import React, { useEffect, useState, useMemo } from "react";
import { fetchAllInvoices } from "../../api/cashier";
import { InvoicePrintTemplate } from "./InvoicePrintTemplate";
import { formatInvoiceReference } from "../../utils/formatId";

interface InvoiceDetail {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  invoiceNumber?: string;
  type: string;
  status: string;
  totalAmount: number;
  balanceDue: number;
  issuedAt: string;
  dueDate: string;
  remarks?: string;
  payments?: Array<{
    id: string;
    amount: number;
    method: string;
    paidAt: string;
    reference?: string;
  }>;
  createdAt: string;
}

const FacturationCaissier: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "PAID" | "PARTIALLY_PAID">("ALL");
  const [printingInvoice, setPrintingInvoice] = useState<InvoiceDetail | null>(null);
  const [printingInvoicePosition, setPrintingInvoicePosition] = useState<number | undefined>(undefined);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAllInvoices();
      setInvoices(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors du chargement des factures";
      setError(message);
      console.error("Error loading factures:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    let results = invoices;

    // Filter by status
    if (filterStatus !== "ALL") {
      results = results.filter((inv) => inv.status === filterStatus);
    }

    // Filter by search query
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (inv) =>
          (inv.invoiceNumber || "").toLowerCase().includes(q) ||
          (inv.patientName || "").toLowerCase().includes(q) ||
          (inv.patientPhone || "").toLowerCase().includes(q) ||
          (inv.patientId || "").toLowerCase().includes(q)
      );
    }

    // Sort by issued date (most recent first)
    return results.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }, [invoices, query, filterStatus]);

  const totals = useMemo(() => {
    const pending = invoices.filter((i) => i.status === "PENDING");
    const paid = invoices.filter((i) => i.status === "PAID");
    const partial = invoices.filter((i) => i.status === "PARTIALLY_PAID");
    const totalAmount = invoices.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);
    const totalDue = invoices.reduce((sum, i) => sum + Number(i.balanceDue || 0), 0);

    return {
      pendingCount: pending.length,
      paidCount: paid.length,
      partialCount: partial.length,
      totalAmount,
      totalDue,
    };
  }, [invoices]);

  const handlePrintInvoice = (invoice: InvoiceDetail) => {
    const index = filtered.findIndex((item) => item.id === invoice.id);
    setPrintingInvoicePosition(index >= 0 ? index + 1 : undefined);
    setPrintingInvoice(invoice);
    // Open print dialog after component renders
    setTimeout(() => {
      window.print();
      setPrintingInvoice(null);
      setPrintingInvoicePosition(undefined);
    }, 150);
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">Chargement des factures...</div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const baseClass = "px-2 py-1 text-xs font-medium rounded";
    switch (status) {
      case "PAID":
        return `${baseClass} bg-green-100 text-green-800`;
      case "PENDING":
        return `${baseClass} bg-red-100 text-red-800`;
      case "PARTIALLY_PAID":
        return `${baseClass} bg-yellow-100 text-yellow-800`;
      default:
        return `${baseClass} bg-gray-100 text-gray-800`;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "PAID":
        return "Payée";
      case "PENDING":
        return "En attente";
      case "PARTIALLY_PAID":
        return "Partiellement payée";
      default:
        return status;
    }
  };

  return (
    <>
    <style>
      {`
        @media screen {
          #invoice-print-area { display: none; }
        }
        @media print {
          body { margin: 0; padding: 0; background: #fff; }
          #main-content { display: none !important; }
          #invoice-print-area { display: block !important; }
        }
      `}
    </style>
    <div id="main-content">
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-semibold mb-4">Facturation</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-4">
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Montant total</div>
          <div className="text-xl font-bold">{totals.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })} USD</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Soldes à recouvrer</div>
          <div className="text-xl font-bold text-red-600">{totals.totalDue.toLocaleString(undefined, { minimumFractionDigits: 0 })} USD</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">En attente</div>
          <div className="text-xl font-bold text-orange-600">{totals.pendingCount}</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Payées</div>
          <div className="text-xl font-bold text-green-600">{totals.paidCount}</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Partiellement payées</div>
          <div className="text-xl font-bold text-yellow-600">{totals.partialCount}</div>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <div>
          <input
            placeholder="Rechercher facture, patient, dossier, téléphone..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus("ALL")}
            className={`px-4 py-2 rounded text-sm ${filterStatus === "ALL" ? "bg-slate-900 text-white" : "bg-white border"}`}
          >
            Toutes ({invoices.length})
          </button>
          <button
            onClick={() => setFilterStatus("PENDING")}
            className={`px-4 py-2 rounded text-sm ${filterStatus === "PENDING" ? "bg-orange-600 text-white" : "bg-white border"}`}
          >
            En attente ({totals.pendingCount})
          </button>
          <button
            onClick={() => setFilterStatus("PAID")}
            className={`px-4 py-2 rounded text-sm ${filterStatus === "PAID" ? "bg-green-600 text-white" : "bg-white border"}`}
          >
            Payées ({totals.paidCount})
          </button>
          <button
            onClick={() => setFilterStatus("PARTIALLY_PAID")}
            className={`px-4 py-2 rounded text-sm ${filterStatus === "PARTIALLY_PAID" ? "bg-yellow-600 text-white" : "bg-white border"}`}
          >
            Partiellement payées ({totals.partialCount})
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">Facture #</th>
              <th className="p-3 text-left">Patient</th>
              <th className="p-3 text-left">Téléphone</th>
              <th className="p-3 text-right">Montant</th>
              <th className="p-3 text-right">Solde dû</th>
              <th className="p-3 text-left">Statut</th>
              <th className="p-3 text-left">Date d'émission</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-sm text-gray-600 text-center">
                  Aucune facture trouvée.
                </td>
              </tr>
            ) : (
              filtered.map((inv, idx) => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium text-blue-600">{formatInvoiceReference(inv.id, inv.invoiceNumber, { truncateTo: 8, position: idx + 1 })}</td>
                  <td className="p-3">{inv.patientName}</td>
                  <td className="p-3 text-sm">{inv.patientPhone || "—"}</td>
                  <td className="p-3 text-right font-medium">
                    {inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })} USD
                  </td>
                  <td className={`p-3 text-right font-medium ${inv.balanceDue > 0 ? "text-red-600" : "text-green-600"}`}>
                    {inv.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 0 })} USD
                  </td>
                  <td className="p-3">
                    <span className={getStatusBadge(inv.status)}>{getStatusLabel(inv.status)}</span>
                  </td>
                  <td className="p-3 text-sm">{new Date(inv.issuedAt).toLocaleDateString("fr-FR")}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => handlePrintInvoice(inv)}
                      className="px-3 py-1 bg-slate-900 text-white rounded text-xs hover:bg-slate-800"
                    >
                      Imprimer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      </div>
    </div>
    <div id="invoice-print-area">
      {printingInvoice && (
        <InvoicePrintTemplate
          patientName={printingInvoice.patientName}
          patientPhone={printingInvoice.patientPhone}
          patientEmail={printingInvoice.patientEmail}
          invoiceNumber={printingInvoice.invoiceNumber}
          invoiceType={printingInvoice.type}
          totalAmount={printingInvoice.totalAmount}
          balanceDue={printingInvoice.balanceDue}
          status={printingInvoice.status}
          issuedAt={printingInvoice.issuedAt}
          dueDate={printingInvoice.dueDate}
          remarks={printingInvoice.remarks}
          invoiceId={printingInvoice.id}
          invoicePosition={printingInvoicePosition}
        />
      )}
    </div>
    </>
  );
};

export default FacturationCaissier;

