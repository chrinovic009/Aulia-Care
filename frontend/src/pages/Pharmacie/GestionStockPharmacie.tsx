import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

type StockMedication = {
  id?: string;
  code?: string;
  name?: string;
  unit?: string;
  strength?: string | null;
  lowStockLevel?: number | string | null;
  availableQuantity?: number | string | null;
  StockLot?: Array<{
    id?: string;
    batchNumber?: string | null;
    quantity?: number | string | null;
    expiryDate?: string | null;
    receivedAt?: string | null;
  }>;
};

export default function GestionStockPharmacie() {
  const [medications, setMedications] = useState<StockMedication[]>([]);
  const [catalogMedications, setCatalogMedications] = useState<StockMedication[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "in-stock" | "low" | "out">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [printingData, setPrintingData] = useState<StockMedication[] | null>(null);
  const [medicationForm, setMedicationForm] = useState({ code: "", name: "", unit: "", strength: "", manufacturer: "" });
  const [lotForm, setLotForm] = useState({ medicationId: "", batchNumber: "", quantity: "", purchasePrice: "", expiryDate: "" });
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<"medication" | "lot" | null>(null);

  const loadStock = async () => {
    setIsLoading(true);
    try {
      const [data, catalog] = await Promise.all([
        apiFetch<StockMedication[]>("/pharmacy/available").catch(() => []),
        apiFetch<StockMedication[]>("/pharmacy").catch(() => []),
      ]);
      setMedications(data || []);
      setCatalogMedications(catalog || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStock();
  }, []);

  const filteredMedications = useMemo(() => {
    const query = search.toLowerCase().trim();

    return medications.filter((medication) => {
      const name = `${medication.code || ""} ${medication.name || ""} ${medication.unit || ""}`.toLowerCase();
      const stockQuantity = Number(medication.availableQuantity || 0);
      const lowStockLevel = Number(medication.lowStockLevel || 10);
      const matchesSearch = !query || name.includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "in-stock" && stockQuantity > lowStockLevel) ||
        (filter === "low" && stockQuantity > 0 && stockQuantity <= lowStockLevel) ||
        (filter === "out" && stockQuantity === 0);

      return matchesSearch && matchesFilter;
    });
  }, [medications, search, filter]);

  const summary = useMemo(() => {
    const total = medications.length;
    const inStock = medications.filter((item) => Number(item.availableQuantity || 0) > Number(item.lowStockLevel || 10)).length;
    const low = medications.filter((item) => Number(item.availableQuantity || 0) > 0 && Number(item.availableQuantity || 0) <= Number(item.lowStockLevel || 10)).length;
    const out = medications.filter((item) => Number(item.availableQuantity || 0) === 0).length;

    return { total, inStock, low, out };
  }, [medications]);

  const handlePrint = () => {
    setPrintingData(filteredMedications);
    window.setTimeout(() => {
      window.print();
      setPrintingData(null);
    }, 200);
  };

  const createMedication = async () => {
    if (!medicationForm.code || !medicationForm.name || !medicationForm.unit) {
      setActionMessage("Le code, le nom et l'unité sont requis pour ajouter un médicament.");
      return;
    }

    try {
      await apiFetch("/administration/stock/medications", { method: "POST", body: JSON.stringify(medicationForm) });
      setMedicationForm({ code: "", name: "", unit: "", strength: "", manufacturer: "" });
      await loadStock();
      setActionMessage("Médicament ajouté au catalogue.");
    } catch (error: unknown) {
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
      await loadStock();
      setActionMessage("Lot ajouté avec succès.");
    } catch (error: unknown) {
      setActionMessage(error instanceof Error ? error.message : "Impossible d'ajouter le lot.");
    }
  };

  return (
    <>
      <style>{`
        @media screen { #pharmacy-stock-print-area { display: none; } }
        @media print {
          body { margin: 0; padding: 0; background: #fff; }
          #main-content { display: none !important; }
          #pharmacy-stock-print-area { display: block !important; }
        }
      `}</style>

    <div id="main-content" className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Pharmacie | État du stock" description="État du stock des médicaments" />
      <PageBreadcrumb pageTitle="État du stock" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 print:hidden md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pharmacie</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">État du stock des médicaments</h1>
            <p className="mt-1 text-sm text-slate-500">Visualisation en temps réel à partir de la base de données.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handlePrint}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Imprimer le document
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
            {actionMessage}
          </div>
        )}

        <section className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/50">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Gestion du stock pharmacie</h2>
            <p className="mt-1 text-sm text-slate-500">Ajout de médicaments et de lots disponibles au stock.</p>
          </div>

          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={() => setActiveForm((current) => (current === "medication" ? null : "medication"))}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {activeForm === "medication" ? "Masquer le formulaire" : "Ajouter un médicament"}
            </button>
            <button
              type="button"
              onClick={() => setActiveForm((current) => (current === "lot" ? null : "lot"))}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {activeForm === "lot" ? "Masquer le formulaire" : "Ajouter un lot"}
            </button>
          </div>

          <div className="mt-4 grid gap-6 xl:grid-cols-2">
            {activeForm === "medication" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Nouveau médicament</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input value={medicationForm.code} onChange={(event) => setMedicationForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <input value={medicationForm.name} onChange={(event) => setMedicationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <input value={medicationForm.unit} onChange={(event) => setMedicationForm((current) => ({ ...current, unit: event.target.value }))} placeholder="Unité" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <input value={medicationForm.strength} onChange={(event) => setMedicationForm((current) => ({ ...current, strength: event.target.value }))} placeholder="Dosage" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <input value={medicationForm.manufacturer} onChange={(event) => setMedicationForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Fabricant" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:col-span-2" />
                  <button onClick={createMedication} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">Ajouter au catalogue</button>
                </div>
              </div>
            ) : null}

            {activeForm === "lot" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Nouveau lot</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <select value={lotForm.medicationId} onChange={(event) => setLotForm((current) => ({ ...current, medicationId: event.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:col-span-2">
                    <option value="">Médicament</option>
                    {catalogMedications.map((medication) => (
                      <option key={medication.id} value={medication.id}>{medication.name}</option>
                    ))}
                  </select>
                  <input value={lotForm.batchNumber} onChange={(event) => setLotForm((current) => ({ ...current, batchNumber: event.target.value }))} placeholder="Lot" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <input value={lotForm.quantity} onChange={(event) => setLotForm((current) => ({ ...current, quantity: event.target.value }))} type="number" placeholder="Quantité" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <input value={lotForm.purchasePrice} onChange={(event) => setLotForm((current) => ({ ...current, purchasePrice: event.target.value }))} type="number" placeholder="Prix achat" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <input value={lotForm.expiryDate} onChange={(event) => setLotForm((current) => ({ ...current, expiryDate: event.target.value }))} type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  <button onClick={createLot} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white sm:col-span-2">Ajouter le lot</button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs uppercase text-slate-500">Total</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{summary.total}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/40">
            <p className="text-xs uppercase text-emerald-700">En stock</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{summary.inStock}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-xs uppercase text-amber-700">Stock faible</p>
            <p className="mt-1 text-xl font-semibold text-amber-700">{summary.low}</p>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/40">
            <p className="text-xs uppercase text-rose-700">Rupture</p>
            <p className="mt-1 text-xl font-semibold text-rose-700">{summary.out}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un médicament, code ou unité"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white md:max-w-md"
          />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as "all" | "in-stock" | "low" | "out")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="all">Tous les états</option>
            <option value="in-stock">En stock</option>
            <option value="low">Stock faible</option>
            <option value="out">Rupture</option>
          </select>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950">
              <tr>
                <th className="px-3 py-2">Médicament</th>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2">Seuil</th>
                <th className="px-3 py-2">État</th>
                <th className="px-3 py-2">Dernier lot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">Chargement du stock...</td>
                </tr>
              ) : filteredMedications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">Aucune donnée ne correspond à la recherche.</td>
                </tr>
              ) : (
                filteredMedications.map((medication) => {
                  const stockQuantity = Number(medication.availableQuantity || 0);
                  const lowStockLevel = Number(medication.lowStockLevel || 10);
                  const latestLot = [...(medication.StockLot || [])]
                    .sort((a, b) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())[0];

                  let statusLabel = "En stock";
                  let statusClass = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
                  if (stockQuantity === 0) {
                    statusLabel = "Rupture";
                    statusClass = "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400";
                  } else if (stockQuantity <= lowStockLevel) {
                    statusLabel = "Stock faible";
                    statusClass = "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
                  }

                  return (
                    <tr key={medication.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50">
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{medication.name || "-"}</div>
                        <div className="text-xs text-slate-500">{medication.code || "-"} • {medication.unit || "-"}</div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900 dark:text-white">{stockQuantity}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{lowStockLevel}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                        {latestLot?.batchNumber || "-"}
                        {latestLot?.expiryDate ? ` • ${new Date(latestLot.expiryDate).toLocaleDateString("fr-FR")}` : ""}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>

      <div id="pharmacy-stock-print-area" className="p-6">
        {printingData ? <StockPrintTemplate medications={printingData} search={search} filter={filter} /> : null}
      </div>
    </>
  );
}

function StockPrintTemplate({ medications, search, filter }: { medications: StockMedication[]; search: string; filter: "all" | "in-stock" | "low" | "out" }) {
  const summary = medications.reduce(
    (acc, medication) => {
      const quantity = Number(medication.availableQuantity || 0);
      const lowStockLevel = Number(medication.lowStockLevel || 10);
      acc.total += 1;
      if (quantity === 0) acc.out += 1;
      else if (quantity <= lowStockLevel) acc.low += 1;
      else acc.inStock += 1;
      return acc;
    },
    { total: 0, inStock: 0, low: 0, out: 0 },
  );

  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#111827", padding: "24px", lineHeight: 1.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f172a", paddingBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>D7 CLINIQUE</div>
          <div style={{ fontSize: "13px", color: "#475569", marginTop: "4px" }}>Pharmacie • État du stock</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "12px", color: "#475569" }}>
          <div><strong>Document administratif</strong></div>
          <div>Émis le {new Date().toLocaleString("fr-FR")}</div>
          <div>Filtre: {filter === "all" ? "Tous" : filter === "in-stock" ? "En stock" : filter === "low" ? "Stock faible" : "Rupture"}</div>
        </div>
      </div>

      <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px" }}>
        <div style={{ border: "1px solid #e2e8f0", padding: "10px", background: "#f8fafc" }}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b" }}>Total</div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>{summary.total}</div>
        </div>
        <div style={{ border: "1px solid #e2e8f0", padding: "10px", background: "#f8fafc" }}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b" }}>En stock</div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>{summary.inStock}</div>
        </div>
        <div style={{ border: "1px solid #e2e8f0", padding: "10px", background: "#f8fafc" }}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b" }}>Stock faible</div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>{summary.low}</div>
        </div>
        <div style={{ border: "1px solid #e2e8f0", padding: "10px", background: "#f8fafc" }}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b" }}>Rupture</div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>{summary.out}</div>
        </div>
      </div>

      <div style={{ marginTop: "12px", fontSize: "13px", color: "#334155" }}>
        {search ? `Recherche appliquée: ${search}` : "Aucune recherche spécifique appliquée."}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px", fontSize: "11px" }}>
        <thead>
          <tr style={{ backgroundColor: "#0f172a", color: "#ffffff" }}>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Médicament</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Code</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Stock</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Seuil</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>État</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Dernier lot</th>
          </tr>
        </thead>
        <tbody>
          {medications.map((medication) => {
            const stockQuantity = Number(medication.availableQuantity || 0);
            const lowStockLevel = Number(medication.lowStockLevel || 10);
            const latestLot = [...(medication.StockLot || [])]
              .sort((a, b) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())[0];
            let statusLabel = "En stock";
            if (stockQuantity === 0) statusLabel = "Rupture";
            else if (stockQuantity <= lowStockLevel) statusLabel = "Stock faible";

            return (
              <tr key={medication.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{medication.name || "-"}</td>
                <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{medication.code || "-"}</td>
                <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{stockQuantity}</td>
                <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{lowStockLevel}</td>
                <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{statusLabel}</td>
                <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{latestLot?.batchNumber || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#334155" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Observations</div>
          <div>Ce document est établi à partir des données de stock enregistrées dans la base de gestion de la pharmacie.</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>Validation</div>
          <div style={{ marginTop: "24px", borderTop: "1px solid #94a3b8", width: "180px", paddingTop: "6px" }}>Signature / cachet</div>
        </div>
      </div>
    </div>
  );
}
