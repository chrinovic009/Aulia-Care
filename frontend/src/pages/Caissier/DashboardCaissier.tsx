import React, { useEffect, useMemo, useState } from "react";
import { getPaymentRequests, getPayments, createPayment, createInvoice, removePaymentRequest } from "../../api/finance";
import { useAuth } from "../../context/AuthContext";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0 });

const DashboardCaissier: React.FC = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  const load = () => {
    setRequests(getPaymentRequests());
    setPayments(getPayments());
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const today = new Date().toISOString().slice(0,10);
    const paymentsToday = payments.filter(p => p.createdAt.slice(0,10) === today);
    const amountToday = paymentsToday.reduce((s:number, p:any) => s + (p.amount||0), 0);
    const pending = requests.filter(r => r.status === 'pending');
    const urgent = requests.filter(r => r.priority === 'urgent');
    return { paymentsCount: paymentsToday.length, amountToday, pendingCount: pending.length, urgentCount: urgent.length };
  }, [payments, requests]);

  const handleProcess = (r: any) => {
    // quick process: create payment and invoice, remove request
    const payment = createPayment({ requestId: r.id, patientId: r.patientId, patientName: r.patientName, amount: r.amount, method: 'cash', cashier: 'Caissière' });
    createInvoice({ requestId: r.id, patientId: r.patientId, patientName: r.patientName, amount: r.amount, paymentId: payment.id });
    removePaymentRequest(r.id);
    load();
  };

  const handleDefer = (r: any) => {
    // mark deferred
    try { // avoid importing defer to keep file minimal
      const arr = JSON.parse(localStorage.getItem('d7-payment-requests')||'[]');
      const idx = arr.findIndex((x:any)=>x.id===r.id);
      if(idx>=0){ arr[idx].status='deferred'; localStorage.setItem('d7-payment-requests', JSON.stringify(arr)); }
    } catch {}
    load();
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Tableau de bord — Caisse</h1>
        <UserHeader />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Total encaissé (aujourd'hui)</div>
          <div className="text-xl font-bold">{fmt(totals.amountToday)}</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Paiements aujourd'hui</div>
          <div className="text-xl font-bold">{totals.paymentsCount}</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Demandes en attente</div>
          <div className="text-xl font-bold">{totals.pendingCount}</div>
        </div>
        <div className="p-3 bg-white rounded shadow text-center">
          <div className="text-sm text-gray-500">Demandes urgentes</div>
          <div className="text-xl font-bold text-red-600">{totals.urgentCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h2 className="font-medium mb-2">Demandes prioritaires</h2>
          <div className="space-y-2">
            {requests.filter(r=>r.status==='pending').map((r:any)=> (
              <div key={r.id} className={`p-3 rounded border flex justify-between items-center ${r.priority==='urgent'?'border-red-300 bg-red-50':'bg-white'}`}>
                <div>
                  <div className="font-medium">{r.patientName} <span className="text-xs text-gray-500">({r.service})</span></div>
                  <div className="text-sm text-gray-600">{r.act} • {r.dossierNumber || '—'}</div>
                  <div className="text-sm text-gray-700">{r.amount} • <span className={`px-1 rounded text-xs ${r.priority==='urgent'?'bg-red-200 text-red-800':'bg-yellow-100 text-yellow-800'}`}>{r.priority}</span></div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-sm text-gray-500">{new Date(r.createdAt).toLocaleTimeString()}</div>
                  <div className="flex gap-2">
                    <button onClick={()=>handleProcess(r)} className="px-3 py-1 bg-slate-900 text-white rounded text-sm">Traiter</button>
                    <button onClick={()=>handleDefer(r)} className="px-3 py-1 border rounded text-sm">Reporter</button>
                  </div>
                </div>
              </div>
            ))}
            {requests.filter(r=>r.status==='pending').length===0 && <div className="p-3 bg-white rounded text-sm text-gray-600">Aucune demande en attente.</div>}
          </div>
        </div>

        <div>
          <h2 className="font-medium mb-2">Paiements récents</h2>
          <div className="bg-white rounded shadow p-2">
            {payments.slice(0,10).map(p=> (
              <div key={p.id} className="flex justify-between py-2 border-b last:border-b-0">
                <div>
                  <div className="font-medium">{p.patientName}</div>
                  <div className="text-xs text-gray-500">{p.method} • {p.reference || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{p.amount}</div>
                  <div className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
            {payments.length===0 && <div className="p-3 text-sm text-gray-600">Aucun paiement récent.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardCaissier;

const UserHeader: React.FC = () => {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const roleLabel = currentUser.primaryRole === "CASHIER" ? (currentUser.gender === "F" ? "Caissière" : "Caissier") : currentUser.primaryRole;
  return (
    <div className="text-right">
      <div className="text-sm text-gray-500">Connecté en tant que</div>
      <div className="font-medium">{currentUser.displayName}</div>
      <div className="text-sm text-gray-600">{roleLabel}</div>
    </div>
  );
};
