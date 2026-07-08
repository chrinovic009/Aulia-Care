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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "in-stock" | "low" | "out">("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStock = async () => {
      setIsLoading(true);
      try {
        const data = await apiFetch<StockMedication[]>("/pharmacy/available").catch(() => []);
        setMedications(data || []);
      } finally {
        setIsLoading(false);
      }
    };

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

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
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
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Imprimer
            </button>
          </div>
        </div>

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
  );
}
