import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, PackageCheck, RefreshCw } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, formatDate, formatMoney } from "../Administration/adminUi";

type Prescription = {
  id: string;
  status: string;
  prescribingDate: string;
  instruction?: string | null;
  patient?: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null };
  prescriber?: { displayName?: string | null; firstName?: string | null; lastName?: string | null };
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

              <button onClick={dispense} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
                Confirmer la remise au patient
              </button>
            </div>
          )}
        </Panel>
      </div>
    </AdminPageShell>
  );
}
