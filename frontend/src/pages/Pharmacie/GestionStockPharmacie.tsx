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
  category?: { id: string; name: string; section?: { id: string; name: string } | null } | null;
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

type SectionOption = {
  id: string;
  name: string;
  categories?: Array<{ id: string; name: string }>;
};

type StockPayload = {
  medications?: Medication[];
  lots?: StockLot[];
  transactions?: Array<{ id: string; type: string; quantity: number; createdAt: string; reference?: string | null; medication?: Medication; lot?: { batchNumber?: string | null } }>;
  dispenses?: unknown[];
  catalogue?: SectionOption[];
};

const emptyMedication = { code: "", name: "", unit: "", strength: "", manufacturer: "" };
const emptyLot = { medicationId: "", batchNumber: "", quantity: "", purchasePrice: "", expiryDate: "" };

export default function GestionStockPharmacie() {
  const [payload, setPayload] = useState<StockPayload>({});
  const [medicationForm, setMedicationForm] = useState(emptyMedication);
  const [sectionForm, setSectionForm] = useState({ name: "", code: "" });
  const [categoryForm, setCategoryForm] = useState({ name: "", code: "" });
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [lotForm, setLotForm] = useState(emptyLot);
  const [lotSectionId, setLotSectionId] = useState("");
  const [lotCategoryId, setLotCategoryId] = useState("");
  const [lotSearch, setLotSearch] = useState("");
  const [saleForm, setSaleForm] = useState({ clientName: "", medicationId: "", quantity: "1" });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const [stockData, catalogueData] = await Promise.all([
        apiFetch<StockPayload>("/pharmacy/stock"),
        apiFetch<SectionOption[]>("/pharmacy/catalogue").catch(() => []),
      ]);
      setPayload({ ...stockData, catalogue: catalogueData });
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
  const sections = payload.catalogue || [];

  const categories = useMemo(() => {
    const currentSection = sections.find((section) => section.id === selectedSectionId);
    return currentSection?.categories || [];
  }, [sections, selectedSectionId]);

  const canCreateCategory = Boolean(selectedSectionId || sectionForm.name.trim());
  const canCreateMedication = Boolean((selectedSectionId || sectionForm.name.trim()) && (selectedCategoryId || categoryForm.name.trim()));

  const lotCategories = useMemo(() => {
    const currentSection = sections.find((section) => section.id === lotSectionId);
    return currentSection?.categories || [];
  }, [sections, lotSectionId]);

  const filteredLotMedications = useMemo(() => {
    const normalized = lotSearch.trim().toLowerCase();
    return medications.filter((medication) => {
      const matchesSection = !lotSectionId || medication.category?.section?.id === lotSectionId;
      const matchesCategory = !lotCategoryId || medication.category?.id === lotCategoryId;
      const matchesSearch = !normalized || `${medication.name} ${medication.strength || ""} ${medication.code}`.toLowerCase().includes(normalized);
      return matchesSection && matchesCategory && matchesSearch;
    });
  }, [lotCategoryId, lotSearch, lotSectionId, medications]);

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

    let sectionIdToUse = selectedSectionId;
    let categoryIdToUse = selectedCategoryId;

    if (!sectionIdToUse && !sectionForm.name) {
      setMessage("Choisis ou crée une section avant d'ajouter un médicament.");
      return;
    }

    if (!sectionIdToUse && sectionForm.name) {
      const section = await apiFetch<{ id: string }>('/pharmacy/catalogue/sections', {
        method: 'POST',
        body: JSON.stringify({ name: sectionForm.name, code: sectionForm.code || sectionForm.name.toUpperCase().replace(/\s+/g, '_') }),
      });
      sectionIdToUse = section.id;
    }

    if (!categoryIdToUse && !categoryForm.name) {
      setMessage("Choisis ou crée une catégorie avant d'ajouter le médicament.");
      return;
    }

    if (!categoryIdToUse && categoryForm.name) {
      const category = await apiFetch<{ id: string }>('/pharmacy/catalogue/categories', {
        method: 'POST',
        body: JSON.stringify({ sectionId: sectionIdToUse, name: categoryForm.name, code: categoryForm.code || categoryForm.name.toUpperCase().replace(/\s+/g, '_') }),
      });
      categoryIdToUse = category.id;
    }

    await apiFetch('/pharmacy/medications', {
      method: 'POST',
      body: JSON.stringify({ ...medicationForm, categoryId: categoryIdToUse }),
    });

    setMedicationForm(emptyMedication);
    setSectionForm({ name: '', code: '' });
    setCategoryForm({ name: '', code: '' });
    setSelectedSectionId('');
    setSelectedCategoryId('');
    setMessage('Médicament ajouté à la catégorie sélectionnée.');
    await load();
  };

  const createLot = async () => {
    setMessage(null);
    if (!lotForm.medicationId || !lotForm.batchNumber || !lotForm.quantity) {
      setMessage('Le médicament, le lot et la quantité sont requis.');
      return;
    }
    await apiFetch('/pharmacy/lots', { method: 'POST', body: JSON.stringify(lotForm) });
    setLotForm(emptyLot);
    setMessage('Lot ajouté au stock.');
    await load();
  };

  const sellExternal = async () => {
    setMessage(null);
    if (!saleForm.medicationId || Number(saleForm.quantity || 0) <= 0) {
      setMessage('Choisis un médicament et une quantité valide.');
      return;
    }

    try {
      await apiFetch('/pharmacy/sales', {
        method: 'POST',
        body: JSON.stringify({
          clientName: saleForm.clientName || undefined,
          medicationId: saleForm.medicationId,
          quantity: Number(saleForm.quantity),
        }),
      });

      setSaleForm({ clientName: '', medicationId: '', quantity: '1' });
      setMessage('Vente externe enregistrée et stock mis à jour.');
      await load();
    } catch (error: any) {
      console.error(error);
      const errMsg = error?.body?.message || error?.message || 'Erreur lors de la vente';
      setMessage(`Échec de la vente : ${errMsg}`);
    }
  };

  return (
    <AdminPageShell title="Stock pharmacie" subtitle="Catalogue, lots, sorties de stock et ventes externes en CDF.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Pill size={20} />} label="Médicaments" value={metrics.medications} tone="blue" />
        <StatCard icon={<PackagePlus size={20} />} label="Lots" value={metrics.lots} tone="green" />
        <StatCard icon={<AlertTriangle size={20} />} label="Stock faible" value={metrics.low} tone={metrics.low ? 'red' : 'green'} />
        <StatCard icon={<ShoppingCart size={20} />} label="Mouvements" value={metrics.movements} tone="violet" />
      </div>

      {message ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Nouveau médicament">
          <div className="grid gap-3">
            <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              <p className="mb-2 font-semibold text-slate-800 dark:text-slate-200">Structure de catalogue</p>
              <div className="grid gap-2 md:grid-cols-2">
                <input value={sectionForm.name} onChange={(event) => setSectionForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nouvelle section" className="h-10 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                <input value={sectionForm.code} onChange={(event) => setSectionForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code section" className="h-10 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <input disabled={!canCreateCategory} value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nouvelle catégorie" className="h-10 rounded-lg border border-slate-200 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900" />
                <input disabled={!canCreateCategory} value={categoryForm.code} onChange={(event) => setCategoryForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code catégorie" className="h-10 rounded-lg border border-slate-200 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900" />
              </div>
            </div>
            <select value={selectedSectionId} onChange={(event) => { setSelectedSectionId(event.target.value); setSelectedCategoryId(''); setCategoryForm({ name: '', code: '' }); }} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Section existante</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
            <select disabled={!selectedSectionId} value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900">
              <option value="">Catégorie existante</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <input value={medicationForm.code} onChange={(event) => setMedicationForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={medicationForm.name} onChange={(event) => setMedicationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={medicationForm.unit} onChange={(event) => setMedicationForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unité / forme" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={medicationForm.strength} onChange={(event) => setMedicationForm((current) => ({ ...current, strength: event.target.value }))} placeholder="Dosage" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={medicationForm.manufacturer} onChange={(event) => setMedicationForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Fabricant" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <p className="text-xs text-slate-500">Choisis d’abord une section puis une catégorie pour pouvoir ajouter un médicament.</p>
            <button disabled={!canCreateMedication} onClick={createMedication} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Ajouter</button>
          </div>
        </Panel>

        <Panel title="Ajouter un lot">
          <div className="grid gap-3">
            <input value={lotSearch} onChange={(event) => setLotSearch(event.target.value)} placeholder="Rechercher un médicament" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <select value={lotSectionId} onChange={(event) => { setLotSectionId(event.target.value); setLotCategoryId(''); setLotForm((current) => ({ ...current, medicationId: '' })); }} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Section</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
            <select disabled={!lotSectionId} value={lotCategoryId} onChange={(event) => { setLotCategoryId(event.target.value); setLotForm((current) => ({ ...current, medicationId: '' })); }} className="h-11 rounded-lg border border-slate-200 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900">
              <option value="">Catégorie</option>
              {lotCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select disabled={!lotSectionId || !lotCategoryId} value={lotForm.medicationId} onChange={(event) => setLotForm((current) => ({ ...current, medicationId: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900">
              <option value="">Médicament</option>
              {filteredLotMedications.map((medication) => <option key={medication.id} value={medication.id}>{medication.name} {medication.strength || ''}</option>)}
            </select>
            <div className="rounded-lg border border-slate-200 p-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
              {lotForm.medicationId ? (() => {
                const selectedMedication = medications.find((item) => item.id === lotForm.medicationId);
                return selectedMedication ? `Section : ${selectedMedication.category?.section?.name || '-'} • Catégorie : ${selectedMedication.category?.name || '-'}` : 'Médicament sélectionné';
              })() : 'Choisis la section et la catégorie pour afficher les médicaments disponibles.'}
            </div>
            <input value={lotForm.batchNumber} onChange={(event) => setLotForm((current) => ({ ...current, batchNumber: event.target.value }))} placeholder="Numéro de lot" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={lotForm.quantity} onChange={(event) => setLotForm((current) => ({ ...current, quantity: event.target.value }))} type="number" placeholder="Quantité" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={lotForm.purchasePrice} onChange={(event) => setLotForm((current) => ({ ...current, purchasePrice: event.target.value }))} type="number" placeholder="Prix unitaire CDF" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={lotForm.expiryDate} onChange={(event) => setLotForm((current) => ({ ...current, expiryDate: event.target.value }))} type="date" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createLot} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Enregistrer le lot</button>
          </div>
        </Panel>

        <Panel title="Vente externe">
          <div className="grid gap-3">
            <input value={saleForm.clientName} onChange={(event) => setSaleForm((current) => ({ ...current, clientName: event.target.value }))} placeholder="Client externe" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <select value={saleForm.medicationId} onChange={(event) => setSaleForm((current) => ({ ...current, medicationId: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Médicament</option>
              {medications.map((medication) => <option key={medication.id} value={medication.id}>{medication.name} - stock {stockByMedication.get(medication.id) || 0}</option>)}
            </select>
            <input value={saleForm.quantity} onChange={(event) => setSaleForm((current) => ({ ...current, quantity: event.target.value }))} type="number" placeholder="Quantité vendue" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={sellExternal} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">Valider la vente</button>
          </div>
        </Panel>
      </div>

      <Panel title="Lots et disponibilités">
        <DataTable
          headers={["Section", "Catégorie", "Médicament", "Lot", "Quantité", "Prix CDF", "Expiration"]}
          empty={isLoading ? 'Chargement du stock...' : 'Aucun lot enregistré.'}
          rows={lots.map((lot) => {
            const critical = Number(lot.quantity || 0) <= 3;
            const low = Number(lot.quantity || 0) <= 10;
            return [
              lot.medication?.category?.section?.name || '-',
              lot.medication?.category?.name || '-',
              lot.medication ? `${lot.medication.name} ${lot.medication.strength || ''}` : lot.medicationId,
              lot.batchNumber || '-',
              lot.quantity,
              lot.purchasePrice ? formatMoney(lot.purchasePrice) : '-',
              formatDate(lot.expiryDate),
            ];
          })}
        />
      </Panel>

      <Panel title="Mouvements récents">
        <DataTable
          headers={["Date", "Médicament", "Type", "Quantité", "Référence"]}
          empty="Aucun mouvement."
          rows={transactions.slice(0, 30).map((transaction) => [
            formatDate(transaction.createdAt),
            transaction.medication?.name || '-',
            transaction.type,
            transaction.quantity,
            transaction.reference || transaction.lot?.batchNumber || '-',
          ])}
        />
      </Panel>
    </AdminPageShell>
  );
}
