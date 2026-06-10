import React, { useEffect, useState } from "react";
import { getInvoices } from "../../api/finance";

const FacturationCaissier: React.FC = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [query, setQuery] = useState("");

  useEffect(()=>{
    setInvoices(getInvoices());
  }, []);

  const filtered = invoices.filter(inv => {
    if(!query) return true;
    const q = query.toLowerCase();
    return inv.invoiceNumber.toLowerCase().includes(q) || (inv.patientName||'').toLowerCase().includes(q) || (inv.patientId||'').toLowerCase().includes(q);
  });

  const printInvoice = (inv:any) => {
    const w = window.open('','_blank','width=600,height=800');
    if(!w) return;
    w.document.write(`<pre style="font-family:Arial">Invoice ${inv.invoiceNumber}\nPatient: ${inv.patientName}\nMontant: ${inv.amount}\nDate: ${new Date(inv.createdAt).toLocaleString()}</pre>`);
    w.document.close();
    w.print();
  };

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-semibold mb-4">Facturation</h1>
      <div className="mb-3 flex gap-2">
        <input placeholder="Rechercher facture, patient, dossier" value={query} onChange={(e)=>setQuery(e.target.value)} className="px-3 py-2 border rounded w-96" />
      </div>
      <div className="bg-white rounded shadow overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Facture #</th>
              <th className="p-2 text-left">Patient</th>
              <th className="p-2 text-left">Montant</th>
              <th className="p-2 text-left">Statut</th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(inv=> (
              <tr key={inv.id} className="border-t">
                <td className="p-2">{inv.invoiceNumber}</td>
                <td className="p-2">{inv.patientName}</td>
                <td className="p-2">{inv.amount}</td>
                <td className="p-2">{inv.status}</td>
                <td className="p-2">{new Date(inv.createdAt).toLocaleString()}</td>
                <td className="p-2 text-center"><button onClick={()=>printInvoice(inv)} className="px-2 py-1 border rounded text-sm">Imprimer</button></td>
              </tr>
            ))}
            {filtered.length===0 && <tr><td colSpan={6} className="p-4 text-sm text-gray-600">Aucune facture trouvée.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FacturationCaissier;
