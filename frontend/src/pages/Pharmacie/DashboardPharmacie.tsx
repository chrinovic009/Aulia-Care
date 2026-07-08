import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { Modal } from "../../components/ui/modal";
import { useModal } from "../../hooks/useModal";
import { apiFetch, ApiError } from "../../config/api";
import { dispensePrescription, fetchReadyPrescriptions, PharmacyPrescription, PharmacyPrescriptionLine } from "../../api/pharmacy";

type MedicationCatalogItem = {
  id?: string;
  code?: string;
  name?: string;
  unit?: string;
  dosage?: string;
  strength?: string | null;
  stockQuantity?: number | string;
  quantity?: number | string;
  lowStockLevel?: number | string;
  manufacturer?: string | null;
  currentQuantity?: number | string | null;
};

type ConsultationSummary = {
  prescriptions?: PharmacyPrescription[];
};

type StockData = {
  lots?: Array<{ medicationId: string; quantity?: number | string | null }>;
  stocks?: Array<{ medicationId: string; quantity?: number | string | null }>;
  medications?: MedicationCatalogItem[];
};

export default function DashboardPharmacie() {
  const [medications, setMedications] = useState<MedicationCatalogItem[]>([]);
  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [readyPrescriptions, setReadyPrescriptions] = useState<PharmacyPrescription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [stock, setStock] = useState<StockData>({});
  const [medicationForm, setMedicationForm] = useState({ code: "", name: "", unit: "", strength: "", manufacturer: "" });
  const [lotForm, setLotForm] = useState({ medicationId: "", batchNumber: "", quantity: "", purchasePrice: "", expiryDate: "" });
  const [conflictMedication, setConflictMedication] = useState<MedicationCatalogItem | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const { isOpen: isConflictOpen, openModal: openConflictModal, closeModal: closeConflictModal } = useModal(false);
  const lotPanelRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const [meds, consults, stockData] = await Promise.all([
        apiFetch<MedicationCatalogItem[]>("/pharmacy").catch(() => []),
        apiFetch<ConsultationSummary[]>("/consultations").catch(() => []),
        apiFetch<StockData>("/administration/stock").catch(() => ({})),
      ]);
      const ready = await fetchReadyPrescriptions().catch(() => []);
      setMedications(meds);
      setConsultations(consults);
      setReadyPrescriptions(ready);
      setStock(stockData || {});
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("d7:consultation.created", handler);
    window.addEventListener("d7:notification.created", handler);
    return () => {
      window.removeEventListener("d7:consultation.created", handler);
      window.removeEventListener("d7:notification.created", handler);
    };
  }, []);

  const prescriptions = useMemo(
    () => consultations.flatMap((consultation) => consultation.prescriptions || []),
    [consultations],
  );

  const pending = prescriptions.filter((item) => item.status !== "DISPENSED");
  const lowStock = medications.filter((item) => Number(item.stockQuantity || item.quantity || 0) <= Number(item.lowStockLevel || 10));
  const readyCount = readyPrescriptions.length;

  const getMedicationStockQuantity = (medicationId: string) => {
    const lotsQuantity = (stock.lots || []).filter((lot) => lot.medicationId === medicationId).reduce((sum: number, lot) => sum + Number(lot.quantity || 0), 0);
    const stocksQuantity = (stock.stocks || []).filter((item) => item.medicationId === medicationId).reduce((sum: number, item) => sum + Number(item.quantity || 0), 0);
    return lotsQuantity || stocksQuantity || 0;
  };

  const closeConflictModalAndClear = () => {
    closeConflictModal();
    setConflictMedication(null);
    setConflictMessage(null);
  };

  const consultExistingMedication = () => {
    if (conflictMedication?.id) {
      setLotForm((current) => ({ ...current, medicationId: conflictMedication.id ?? "" }));
      setTimeout(() => lotPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      setActionMessage("Le médicament a été trouvé et sélectionné dans le formulaire de lot.");
    }
    closeConflictModalAndClear();
  };

  const openMedicationInLotForm = () => {
    if (conflictMedication?.id) {
      setLotForm((current) => ({ ...current, medicationId: conflictMedication.id ?? "" }));
      setTimeout(() => lotPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      setActionMessage("Vous pouvez ajouter de nouvelles quantités dans le formulaire de lot ci-dessous.");
    }
    closeConflictModalAndClear();
  };

  const createMedication = async () => {
    if (!medicationForm.code || !medicationForm.name || !medicationForm.unit) {
      setActionMessage("Le code, le nom et l'unité sont requis pour ajouter un médicament.");
      return;
    }

    try {
      await apiFetch("/administration/stock/medications", { method: "POST", body: JSON.stringify(medicationForm) });
      setMedicationForm({ code: "", name: "", unit: "", strength: "", manufacturer: "" });
      const refreshedStock = await apiFetch("/administration/stock").catch(() => ({}));
      setStock(refreshedStock || {});
      setActionMessage("Médicament ajouté au catalogue.");
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409) {
        const body = error.body || {};
        setConflictMedication(body.medication || null);
        setConflictMessage(
          typeof body.message === "string"
            ? body.message
            : "Ce médicament existe déjà dans le stock. Il n'est pas nécessaire de le recréer. Vous pouvez le retrouver dans la liste des médicaments ou mettre à jour sa quantité."
        );
        openConflictModal();
        return;
      }

      setActionMessage(error instanceof Error ? error.message : "Impossible d'ajouter le médicament.");
    }
  };

  const createLot = async () => {
    if (!lotForm.medicationId || !lotForm.batchNumber) {
      setActionMessage("Le médicament et le numéro de lot sont requis.");
      return;
    }

    try {
      await apiFetch("/administration/stock/lots", { method: "POST", body: JSON.stringify(lotForm) });
      setLotForm({ medicationId: "", batchNumber: "", quantity: "", purchasePrice: "", expiryDate: "" });
      const refreshedStock = await apiFetch("/administration/stock").catch(() => ({}));
      setStock(refreshedStock || {});
      setActionMessage("Lot ajouté avec succès.");
    } catch (error: unknown) {
      setActionMessage(error instanceof Error ? error.message : "Impossible d'ajouter le lot.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Pharmacie | D7 Clinique" description="Gestion pharmacie basee sur PostgreSQL." />
      <PageBreadcrumb pageTitle="Pharmacie" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Interface pharmacien</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Ordonnances et stock</h1>
          </div>
          <button onClick={load} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
            {isLoading ? "Chargement" : "Actualiser"}
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-5">
          <Metric label="Ordonnances en attente" value={pending.length} tone="amber" />
          <Metric label="Ordonnances servies" value={prescriptions.length - pending.length} tone="green" />
          <Metric label="Ordonnances payées" value={readyCount} tone="blue" />
          <Metric label="Medicaments" value={medications.length} />
          <Metric label="Stock faible" value={lowStock.length} tone="red" />
        </div>
      </section>

      {actionMessage && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">{actionMessage}</div>}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Gestion du stock pharmacie</h2>
          <p className="mt-1 text-sm text-slate-500">Réservé au pharmacien : ajout de médicaments et de lots disponibles au stock.</p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Nouveau médicament">
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={medicationForm.code} onChange={(event) => setMedicationForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={medicationForm.name} onChange={(event) => setMedicationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={medicationForm.unit} onChange={(event) => setMedicationForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unité" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={medicationForm.strength} onChange={(event) => setMedicationForm((current) => ({ ...current, strength: event.target.value }))} placeholder="Dosage" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
              <input value={medicationForm.manufacturer} onChange={(event) => setMedicationForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Fabricant" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:col-span-2" />
              <button onClick={createMedication} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">Ajouter au catalogue</button>
            </div>
          </Panel>

          <div ref={lotPanelRef}>
            <Panel title="Nouveau lot">
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={lotForm.medicationId} onChange={(event) => setLotForm((current) => ({ ...current, medicationId: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:col-span-2">
                  <option value="">Médicament</option>
                  {(stock.medications || []).map((medication) => <option key={medication.id} value={medication.id}>{medication.name}</option>)}
                </select>
                <input value={lotForm.batchNumber} onChange={(event) => setLotForm((current) => ({ ...current, batchNumber: event.target.value }))} placeholder="Lot" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                <input value={lotForm.quantity} onChange={(event) => setLotForm((current) => ({ ...current, quantity: event.target.value }))} type="number" placeholder="Quantité" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                <input value={lotForm.purchasePrice} onChange={(event) => setLotForm((current) => ({ ...current, purchasePrice: event.target.value }))} type="number" placeholder="Prix achat" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                <input value={lotForm.expiryDate} onChange={(event) => setLotForm((current) => ({ ...current, expiryDate: event.target.value }))} type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                <button onClick={createLot} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">Ajouter le lot</button>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Ordonnances">
          <div className="mb-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <p className="font-semibold">Ordonnances payées prêtes à délivrer</p>
            <p className="mt-1 text-xs text-slate-500">La délivrance met à jour le stock et ne peut plus être annulée.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-950">
                <tr>
                  <th className="px-3 py-2">Patient</th>
                  <th className="px-3 py-2">Détail</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {readyPrescriptions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-slate-500 dark:text-slate-400">Aucune ordonnance prête.</td>
                  </tr>
                ) : (
                  readyPrescriptions.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{[item.patient?.firstName, item.patient?.lastName].filter(Boolean).join(" ") || "-"}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.instruction || item.lineItems?.map((line) => `${line.medication?.name || "Médicament"} x${line.quantity}`).join(", ") || "-"}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{item.prescribingDate ? new Date(item.prescribingDate).toLocaleString("fr-FR") : "-"}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={async () => {
                            try {
                              await dispensePrescription(item.id);
                              setActionMessage("Ordonnance délivrée avec succès.");
                              load();
                            } catch (error: unknown) {
                              setActionMessage(error instanceof Error ? error.message : "Impossible de délivrer l’ordonnance.");
                            }
                          }}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Délivrer
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Table headers={["Statut", "Date", "Instruction"]} rows={prescriptions.slice(0, 15).map((item) => [
            item.status || "-",
            item.prescribingDate ? new Date(item.prescribingDate).toLocaleString("fr-FR") : "-",
            item.instruction || item.lineItems?.map((line: PharmacyPrescriptionLine) => [line.dosage, line.frequency, line.notes].filter(Boolean).join(" - ")).join(", ") || "-",
          ])} />
        </Panel>
        <Panel title="Catalogue medicaments">
          <Table headers={["Code", "Nom", "Dosage", "Unite"]} rows={medications.slice(0, 15).map((item) => [
            item.code || "-",
            item.name || "-",
            item.dosage || "-",
            item.unit || "-",
          ])} />
        </Panel>
      </div>

      <Modal isOpen={isConflictOpen} onClose={closeConflictModalAndClear} className="max-w-xl p-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-blue-100 text-blue-700 dark:bg-slate-800 dark:text-blue-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Médicament déjà enregistré</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{conflictMessage || "Ce médicament existe déjà dans le stock. Il n'est pas nécessaire de le recréer. Vous pouvez le retrouver dans la liste des médicaments ou mettre à jour sa quantité."}</p>
            </div>
          </div>

          {conflictMedication ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-slate-500">Nom</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{conflictMedication.name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Dosage</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{conflictMedication.strength || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Forme pharmaceutique</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{conflictMedication.unit || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Quantité actuelle</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{conflictMedication.currentQuantity ?? getMedicationStockQuantity(conflictMedication.id ?? "") ?? "-"}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={consultExistingMedication} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
              Consulter le médicament
            </button>
            <button type="button" onClick={openMedicationInLotForm} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900">
              Mettre à jour le stock
            </button>
            <button type="button" onClick={closeConflictModalAndClear} className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
              Fermer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" | "green" | "red" | "blue" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    amber: "text-amber-700 dark:text-amber-300",
    green: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
    blue: "text-blue-700 dark:text-blue-300",
  };
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2><div className="mt-4">{children}</div></section>;
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-950"><tr>{headers.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 ? <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-slate-500">Aucune donnee.</td></tr> : rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-slate-700 dark:text-slate-200">{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
