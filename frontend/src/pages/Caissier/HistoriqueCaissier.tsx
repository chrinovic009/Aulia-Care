import React, { useEffect, useState } from "react";
import { getPayments, getInvoices } from "../../api/finance";

const HistoriqueCaissier: React.FC = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setPayments(getPayments());
    setInvoices(getInvoices());
  }, []);

  const combined = [...payments.map((p) => ({ type: "payment", ...p })), ...invoices.map((i) => ({ type: "invoice", ...i }))].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = combined.filter((r: any) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (r.patientName || "").toLowerCase().includes(q) || (r.id || "").toLowerCase().includes(q) || (r.reference || "").toLowerCase().includes(q);
  });

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-semibold mb-4">Historique financier</h1>
      <div className="mb-3">
        <input placeholder="Rechercher transaction, patient, référence" value={query} onChange={(e) => setQuery(e.target.value)} className="px-3 py-2 border rounded w-96" />
      </div>

      <div className="bg-white rounded shadow overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Patient</th>
              <th className="p-2 text-left">Montant</th>
              <th className="p-2 text-left">Référence</th>
              <th className="p-2 text-left">Opérateur</th>
              <th className="p-2 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.type}</td>
                <td className="p-2">{r.patientName}</td>
                <td className="p-2">{r.amount}</td>
                <td className="p-2">{r.reference || r.invoiceNumber || "—"}</td>
                <td className="p-2">{r.cashier || "—"}</td>
                <td className="p-2">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-sm text-gray-600">
                  Aucun historique trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HistoriqueCaissier;
