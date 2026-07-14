import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, PackagePlus, Pill, ShoppingCart } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, formatDate, formatMoney } from "../Administration/adminUi";

type Medication = {
  id: string;
  code: string;
  name: string;
  unit?: string | null;
  strength?: string | null;
  manufacturer?: string | null;
};

type StockLot = {
  id: string;
  medicationId: string;
  batchNumber?: string | null;
  quantity: number;
  purchasePrice?: string | number | null;
  expiryDate?: string | null;
  receivedAt?: string | null;
  medication?: Medication;
};

type StockPayload = {
  medications?: Medication[];
  lots?: StockLot[];
  transactions?: Array<{ id: string; type: string; quantity: number; createdAt: string; reference?: string | null; medication?: Medication; lot?: { batchNumber?: string | null } }>;
  dispenses?: unknown[];
};

const emptyMedication = { code: "", name: "", unit: "", strength: "", manufacturer: "" };
const emptyLot = { medicationId: "", batchNumber: "", quantity: "", purchasePrice: "", expiryDate: "" };

export default function GestionStockPharmacie() {
  const [payload, setPayload] = useState<StockPayload>({});
  const [medicationForm, setMedicationForm] = useState(emptyMedication);
  const [lotForm, setLotForm] = useState(emptyLot);
  const [saleForm, setSaleForm] = useState({ clientName: "", medicationId: "", quantity: "1" });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      setPayload(await apiFetch<StockPayload>("/pharmacy/stock"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const medications = payload.medications || [];
  const lots = payload.lots || [];
  const transactions = payload.transactions || [];

  const stockByMedication = useMemo(() => {
    const map = new Map<string, number>();
    lots.forEach((lot) => map.set(lot.medicationId, (map.get(lot.medicationId) || 0) + Number(lot.quantity || 0)));
    return map;
  }, [lots]);

  const metrics = {
    medications: medications.length,
    lots: lots.length,
    low: medications.filter((item) => (stockByMedication.get(item.id) || 0) <= 10).length,
    movements: transactions.length,
  };

  const createMedication = async () => {
    setMessage(null);
    if (!medicationForm.code || !medicationForm.name || !medicationForm.unit) {
      setMessage("Le code, le nom et l'unite sont requis.");
      return;
    }
    await apiFetch("/pharmacy/medications", { method: "POST", body: JSON.stringify(medicationForm) });
    setMedicationForm(emptyMedication);
    setMessage("Medicament ajoute au catalogue pharmacie.");
    await load();
  };

  const createLot = async () => {
    setMessage(null);
    if (!lotForm.medicationId || !lotForm.batchNumber || !lotForm.quantity) {
      setMessage("Le medicament, le lot et la quantite sont requis.");
      return;
    }
    await apiFetch("/pharmacy/lots", { method: "POST", body: JSON.stringify(lotForm) });
    setLotForm(emptyLot);
    setMessage("Lot ajoute au stock.");
    await load();
  };

  const sellExternal = async () => {
    setMessage(null);
    if (!saleForm.medicationId || Number(saleForm.quantity || 0) <= 0) {
      setMessage("Choisis un medicament et une quantite valide.");
      return;
    }
    await apiFetch("/pharmacy/sales", {
      method: "POST",
      body: JSON.stringify({
        clientName: saleForm.clientName || undefined,
        lines: [{ medicationId: saleForm.medicationId, quantity: Number(saleForm.quantity) }],
      }),
    });
    setSaleForm({ clientName: "", medicationId: "", quantity: "1" });
    setMessage("Vente externe enregistree et stock mis a jour.");
    await load();
  };

  return (
    <AdminPageShell title="Stock pharmacie" subtitle="Catalogue, lots, sorties de stock et ventes externes en CDF.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Pill size={20} />} label="Medicaments" value={metrics.medications} tone="blue" />
        <StatCard icon={<PackagePlus size={20} />} label="Lots" value={metrics.lots} tone="green" />
        <StatCard icon={<AlertTriangle size={20} />} label="Stock faible" value={metrics.low} tone={metrics.low ? "red" : "green"} />
        <StatCard icon={<ShoppingCart size={20} />} label="Mouvements" value={metrics.movements} tone="violet" />
      </div>

      {message ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Nouveau medicament">
          <div className="grid gap-3">
            <input value={medicationForm.code} onChange={(event) => setMedicationForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={medicationForm.name} onChange={(event) => setMedicationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={medicationForm.unit} onChange={(event) => setMedicationForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unite / forme" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={medicationForm.strength} onChange={(event) => setMedicationForm((current) => ({ ...current, strength: event.target.value }))} placeholder="Dosage" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={medicationForm.manufacturer} onChange={(event) => setMedicationForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Fabricant" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createMedication} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Ajouter</button>
          </div>
        </Panel>

        <Panel title="Ajouter un lot">
          <div className="grid gap-3">
            <select value={lotForm.medicationId} onChange={(event) => setLotForm((current) => ({ ...current, medicationId: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Medicament</option>
              {medications.map((medication) => <option key={medication.id} value={medication.id}>{medication.name} {medication.strength || ""}</option>)}
            </select>
            <input value={lotForm.batchNumber} onChange={(event) => setLotForm((current) => ({ ...current, batchNumber: event.target.value }))} placeholder="Numero de lot" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={lotForm.quantity} onChange={(event) => setLotForm((current) => ({ ...current, quantity: event.target.value }))} type="number" placeholder="Quantite" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={lotForm.purchasePrice} onChange={(event) => setLotForm((current) => ({ ...current, purchasePrice: event.target.value }))} type="number" placeholder="Prix unitaire CDF" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={lotForm.expiryDate} onChange={(event) => setLotForm((current) => ({ ...current, expiryDate: event.target.value }))} type="date" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createLot} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Enregistrer le lot</button>
          </div>
        </Panel>

        <Panel title="Vente externe">
          <div className="grid gap-3">
            <input value={saleForm.clientName} onChange={(event) => setSaleForm((current) => ({ ...current, clientName: event.target.value }))} placeholder="Client externe" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <select value={saleForm.medicationId} onChange={(event) => setSaleForm((current) => ({ ...current, medicationId: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Medicament</option>
              {medications.map((medication) => <option key={medication.id} value={medication.id}>{medication.name} - stock {stockByMedication.get(medication.id) || 0}</option>)}
            </select>
            <input value={saleForm.quantity} onChange={(event) => setSaleForm((current) => ({ ...current, quantity: event.target.value }))} type="number" placeholder="Quantite vendue" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={sellExternal} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Valider la vente</button>
          </div>
        </Panel>
      </div>

      <Panel title="Lots et disponibilites">
        <DataTable
          headers={["Medicament", "Lot", "Quantite", "Prix CDF", "Expiration", "Statut"]}
          empty={isLoading ? "Chargement du stock..." : "Aucun lot enregistre."}
          rows={lots.map((lot) => {
            const critical = Number(lot.quantity || 0) <= 3;
            const low = Number(lot.quantity || 0) <= 10;
            return [
              lot.medication ? `${lot.medication.name} ${lot.medication.strength || ""}` : lot.medicationId,
              lot.batchNumber || "-",
              lot.quantity,
              lot.purchasePrice ? formatMoney(lot.purchasePrice) : "-",
              formatDate(lot.expiryDate),
              critical ? "Critique" : low ? "Faible" : "Disponible",
            ];
          })}
        />
      </Panel>

      <Panel title="Mouvements recents">
        <DataTable
          headers={["Date", "Medicament", "Type", "Quantite", "Reference"]}
          empty="Aucun mouvement."
          rows={transactions.slice(0, 30).map((transaction) => [
            formatDate(transaction.createdAt),
            transaction.medication?.name || "-",
            transaction.type,
            transaction.quantity,
            transaction.reference || transaction.lot?.batchNumber || "-",
          ])}
        />
      </Panel>
    </AdminPageShell>
  );
}
