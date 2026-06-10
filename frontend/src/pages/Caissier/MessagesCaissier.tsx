import React, { useEffect, useState } from "react";
import { getPaymentRequests, createPayment, createInvoice, removePaymentRequest, deferPaymentRequest } from "../../api/finance";
import { updatePatientRecord } from "../../api/reception";

const MessagesCaissier: React.FC = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [toast, setToast] = useState<{ visible: boolean; text?: string }>({ visible: false });
  const [showPaymentFields, setShowPaymentFields] = useState(false);

  const load = () =>
    setRequests(
      getPaymentRequests()
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    );

  useEffect(() => {
    load();
    const handler = (ev: any) => {
      const request = ev.detail;
      if (!request) return;
      setRequests((prev) => [request, ...prev].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setSelected(request);
      setToast({ visible: true, text: `${request.patientName} doit ${request.amount} CDF pour ${request.act}` });
      setShowPaymentFields(false);
      setAmount(request.amount || 0);
      setReference("");
      setMethod("cash");
      setTimeout(() => setToast({ visible: false }), 10000);
    };
    const updateHandler = () => load();
    const storageHandler = (event: StorageEvent) => {
      if (event.key === "d7-payment-requests") {
        load();
      }
    };

    window.addEventListener("d7:paymentRequest", handler as EventListener);
    window.addEventListener("d7:paymentRequestsUpdated", updateHandler as EventListener);
    window.addEventListener("storage", storageHandler as EventListener);
    return () => {
      window.removeEventListener("d7:paymentRequest", handler as EventListener);
      window.removeEventListener("d7:paymentRequestsUpdated", updateHandler as EventListener);
      window.removeEventListener("storage", storageHandler as EventListener);
    };
  }, []);

  const pick = (r:any) => { setSelected(r); setAmount(r.amount); setReference(''); setMethod('cash'); };

  const doPayment = () => {
    if (!selected) return;
    const pay = createPayment({ requestId: selected.id, patientId: selected.patientId, patientName: selected.patientName, amount, method: method as any, reference, cashier: 'Caissière' });
    createInvoice({ requestId: selected.id, patientId: selected.patientId, patientName: selected.patientName, amount, paymentId: pay.id });

    updatePatientRecord({
      id: selected.patientId,
      paymentStatus: "paid",
      status: "Fiche validée",
      paymentMethod: method as any,
      lastUpdate: `Paiement confirmé le ${new Date().toLocaleString()}`,
    });

    window.dispatchEvent(new CustomEvent("d7:patientReadyForVitals", {
      detail: {
        patientId: selected.patientId,
        patientName: selected.patientName,
        timestamp: Date.now(),
      },
    }));

    removePaymentRequest(selected.id);
    setSelected(null);
    setShowPaymentFields(false);
    load();
  };

  const doDefer = () => {
    if (!selected) return;
    deferPaymentRequest(selected.id);
    updatePatientRecord({
      id: selected.patientId,
      paymentStatus: "deferred",
      status: "Fiche en attente",
      lastUpdate: `Paiement reporté le ${new Date().toLocaleString()}`,
    });
    setSelected(null);
    load();
  };

  const doCancelPayment = () => {
    if (!selected) return;
    updatePatientRecord({
      id: selected.patientId,
      paymentStatus: "cancelled",
      status: "Fiche annulé",
      lastUpdate: `Paiement annulé le ${new Date().toLocaleString()}`,
    });
    removePaymentRequest(selected.id);
    setSelected(null);
    setShowPaymentFields(false);
    load();
  };

  return (
    <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
      {toast.visible && (
        <div className="fixed right-4 top-4 z-50 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          <div className="font-semibold">Nouvelle demande de paiement</div>
          <div className="mt-1">{toast.text}</div>
        </div>
      )}
      <div className="col-span-1 lg:col-span-1 bg-white rounded shadow p-2">
        <h2 className="font-medium mb-2">Demandes</h2>
        <div className="space-y-2">
          {requests.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r)}
              className={`w-full text-left p-2 rounded border ${r.priority === 'urgent' ? 'bg-red-50' : ''}`}
            >
              <div className="font-medium">{r.patientName}</div>
              <div className="text-xs text-gray-500">{r.act} • {r.service}</div>
              <div className="text-xs text-gray-500">ID patient: {r.patientId || 'N/A'}</div>
              <div className="text-sm flex items-center justify-between gap-3">
                <span>{r.amount} CDF</span>
                <span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleTimeString()}</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-700">Statut demande: {r.status}</div>
            </button>
          ))}
          {requests.length === 0 && <div className="text-sm text-gray-600">Aucune demande</div>}
        </div>
      </div>

      <div className="col-span-1 lg:col-span-2 bg-white rounded shadow p-4">
        <h2 className="font-medium mb-2">Détail demande</h2>
        {selected ? (
          <div>
            <div className="mb-2"><strong>Patient:</strong> {selected.patientName} <span className="text-sm text-gray-500">{selected.dossierNumber || ''}</span></div>
            <div className="mb-2"><strong>ID patient:</strong> <span className="font-medium">{selected.patientId || 'N/A'}</span></div>
            <div className="mb-2"><strong>Demande:</strong> {selected.act} • {selected.service}</div>
            <div className="mb-2"><strong>Montant demandé:</strong> {selected.amount} CDF</div>
            <div className="mb-2"><strong>Statut demande:</strong> {selected.status}</div>
            <div className="mb-2 text-sm text-gray-600">Demandé le: {new Date(selected.createdAt).toLocaleString()}</div>
            {!showPaymentFields ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => setShowPaymentFields(true)} className="px-3 py-1 bg-slate-900 text-white rounded">Confirmer le paiement</button>
                <button onClick={doDefer} className="px-3 py-1 border rounded">Reporter</button>
                <button onClick={doCancelPayment} className="px-3 py-1 border border-red-500 text-red-600 rounded">Annuler la fiche</button>
                <button onClick={() => { setSelected(null); setShowPaymentFields(false); }} className="px-3 py-1 border rounded">Fermer</button>
              </div>
            ) : (
              <>
                <div className="mt-4">
                  <label className="block text-sm">Montant</label>
                  <input type="number" value={amount} onChange={(e)=>setAmount(Number(e.target.value))} className="mt-1 px-2 py-1 border rounded w-48" />
                </div>
                <div className="mt-3">
                  <label className="block text-sm">Mode paiement</label>
                  <select value={method} onChange={(e)=>setMethod(e.target.value)} className="mt-1 px-2 py-1 border rounded w-48">
                    <option value="cash">Cash</option>
                    <option value="airtel">Airtel Money</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div className="mt-3">
                  <label className="block text-sm">Référence (si applicable)</label>
                  <input value={reference} onChange={(e)=>setReference(e.target.value)} className="mt-1 px-2 py-1 border rounded w-72" />
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={doPayment} className="px-3 py-1 bg-slate-900 text-white rounded">Effectuer le paiement</button>
                  <button onClick={doDefer} className="px-3 py-1 border rounded">Reporter</button>
                  <button onClick={() => { setSelected(null); setShowPaymentFields(false); }} className="px-3 py-1 border rounded">Fermer</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-600">Sélectionnez une demande pour voir les détails.</div>
        )}
      </div>

      <div className="col-span-1 lg:col-span-1 bg-white rounded shadow p-2">
        <h2 className="font-medium mb-2">Raccourcis</h2>
        <div className="text-sm text-gray-600">Actions rapides pour la caissière.</div>
      </div>
    </div>
  );
};

export default MessagesCaissier;
