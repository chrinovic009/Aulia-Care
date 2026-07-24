import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, PackageCheck, RefreshCw } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, formatDate, formatMoney } from "../Administration/adminUi";

type Prescription = {
  id: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  prescribingDate: string;
  instruction?: string | null;
  patient?: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null };
  prescriber?: { displayName?: string | null; firstName?: string | null; lastName?: string | null };
  pharmacyDispenses?: Array<{
    id: string;
    status: string;
    notes?: string | null;
    location?: string | null;
    dispensedAt?: string | null;
    lines?: Array<{
      id: string;
      medicationId: string;
      medication?: { name?: string | null; strength?: string | null } | null;
      quantity: number;
      unitPrice?: number | string | null;
      totalPrice?: number | string | null;
    }>;
  }>;
  lineItems?: Array<{
    id: string;
    dosage?: string | null;
    frequency?: string | null;
    quantity: number;
    notes?: string | null;
    medication?: {
      id: string;
      name?: string | null;
      unit?: string | null;
      strength?: string | null;
      StockLot?: Array<{ quantity: number; purchasePrice?: string | number | null }>;
    };
  }>;
};

const patientName = (prescription: Prescription) =>
  [prescription.patient?.firstName, prescription.patient?.lastName].filter(Boolean).join(" ") || "Patient";

const prescriberName = (prescription: Prescription) =>
  prescription.prescriber?.displayName || [prescription.prescriber?.firstName, prescription.prescriber?.lastName].filter(Boolean).join(" ") || "-";

export default function DelivrancePharmacie() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [detailPrescription, setDetailPrescription] = useState<Prescription | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<Prescription[]>("/pharmacy/prescriptions").catch(() => []);
      setPrescriptions(data);
      setSelected((current) => current || data[0] || null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => ({
    pending: prescriptions.length,
    lines: prescriptions.reduce((sum, prescription) => sum + (prescription.lineItems?.length || 0), 0),
    urgent: prescriptions.filter((prescription) => prescription.instruction?.toLowerCase().includes("urgent")).length,
  }), [prescriptions]);

  const dispense = async () => {
    if (!selected) return;
    setMessage(null);
    await apiFetch(`/pharmacy/prescriptions/${selected.id}/dispense`, {
      method: "POST",
      body: JSON.stringify({ notes: "Medicaments remis au patient", location: "Pharmacie" }),
    });
    setMessage("Prescription delivree et stock mis a jour.");
    setSelected(null);
    await load();
  };

  const cancelDispense = async () => {
    if (!detailPrescription) return;
    setMessage(null);
    await apiFetch(`/pharmacy/prescriptions/${detailPrescription.id}/cancel-dispense`, {
      method: "POST",
    });
    setMessage("La délivrance a été annulée. Vous pouvez maintenant ajuster la prescription.");
    setDetailPrescription(null);
    await load();
  };

  const isDispensed = Boolean(selected?.pharmacyDispenses?.some((dispense) => dispense.status !== "CANCELLED"));
  const canCancelDispense = Boolean(
    selected?.version && selected.version > 1 &&
      selected?.createdAt &&
      Date.now() - new Date(selected.createdAt).getTime() <= 24 * 60 * 60 * 1000,
  );

  return (
    <AdminPageShell
      title="Delivrance pharmacie"
      subtitle="Prescriptions payees par la caisse, remise au patient et sortie automatique du stock."
      actions={<button onClick={load} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={16} /> Actualiser</button>}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard icon={<PackageCheck size={20} />} label="Prescriptions a remettre" value={metrics.pending} tone="amber" />
        <StatCard icon={<CheckCircle2 size={20} />} label="Lignes medicaments" value={metrics.lines} tone="blue" />
        <StatCard icon={<PackageCheck size={20} />} label="Prioritaires" value={metrics.urgent} tone={metrics.urgent ? "red" : "green"} />
      </div>

      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel title="File de delivrance">
          <div className="space-y-3">
            {isLoading ? <p className="text-sm text-slate-500">Chargement...</p> : null}
            {!isLoading && prescriptions.length === 0 ? <p className="text-sm text-slate-500">Aucune prescription payee en attente.</p> : null}
            {prescriptions.map((prescription) => (
              <button
                key={prescription.id}
                onClick={() => setSelected(prescription)}
                className={`w-full rounded-lg border p-3 text-left ${selected?.id === prescription.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <p className="font-semibold text-slate-900">{patientName(prescription)}</p>
                <p className="mt-1 text-xs text-slate-500">Medecin: {prescriberName(prescription)}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(prescription.prescribingDate)}</p>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Details de l'ordonnance">
          {!selected ? (
            <p className="text-sm text-slate-500">Selectionnez une prescription.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{patientName(selected)}</p>
                <p className="mt-1 text-sm text-slate-500">Telephone: {selected.patient?.phone || "-"} | Email: {selected.patient?.email || "-"}</p>
                <p className="mt-1 text-sm text-slate-500">Prescripteur: {prescriberName(selected)}</p>
                <p className="mt-2 text-sm text-slate-700">{selected.instruction || "Aucune instruction particuliere."}</p>
              </div>

              <DataTable
                headers={["Medicament", "Posologie", "Quantite", "Prix CDF", "Stock"]}
                rows={(selected.lineItems || []).map((line) => {
                  const stock = (line.medication?.StockLot || []).reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
                  const latestLot = (line.medication?.StockLot || [])[0];
                  return [
                    `${line.medication?.name || "-"} ${line.medication?.strength || ""}`,
                    [line.dosage, line.frequency, line.notes].filter(Boolean).join(" - ") || "-",
                    line.quantity,
                    latestLot?.purchasePrice ? formatMoney(latestLot.purchasePrice) : "-",
                    stock,
                  ];
                })}
              />

              <button
                onClick={() => {
                  if (isDispensed) {
                    setDetailPrescription(selected);
                    return;
                  }
                  void dispense();
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                {isDispensed ? "Détail de la remise" : "Confirmer la remise au patient"}
              </button>
            </div>
          )}
        </Panel>
      </div>

      {detailPrescription ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Détail de la remise</h3>
                <p className="mt-1 text-sm text-slate-500">Prescription et état de la pharmacie</p>
              </div>
              <button onClick={() => setDetailPrescription(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Fermer</button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Instructions du médecin</p>
                <p className="mt-2 text-sm text-slate-700">{detailPrescription.instruction || "Aucune instruction particulière."}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Etat pharmacie</p>
                <p className="mt-2 text-sm text-slate-700">{detailPrescription.pharmacyDispenses?.some((dispense) => dispense.status !== "CANCELLED") ? "Déjà délivrée" : "En attente de délivrance"}</p>
                <p className="mt-1 text-xs text-slate-500">{detailPrescription.pharmacyDispenses?.[0]?.dispensedAt ? formatDate(detailPrescription.pharmacyDispenses[0].dispensedAt) : "-"}</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Lignes de prescription</p>
              <div className="mt-3 space-y-2">
                {(detailPrescription.lineItems || []).map((line) => (
                  <div key={line.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">{line.medication?.name || "Médicament"}</p>
                    <p className="mt-1">Posologie: {line.dosage || "-"} • Quantité: {line.quantity} • Fréquence: {line.frequency || "-"}</p>
                    <p className="mt-1">Notes: {line.notes || "-"}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => setDetailPrescription(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Fermer</button>
              {detailPrescription.pharmacyDispenses?.some((dispense) => dispense.status !== "CANCELLED") && canCancelDispense ? (
                <button onClick={() => void cancelDispense()} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Annuler la délivrance</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
