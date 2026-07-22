import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchPharmacyHistory, PharmacyHistoryRecord } from "../../api/pharmacy";

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} CDF`;
}

export default function HistoriquePharmacie() {
  const [records, setRecords] = useState<PharmacyHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "DISPENSE" | "SALE">("ALL");
  const [dateRange, setDateRange] = useState<"ALL" | "TODAY" | "WEEK" | "MONTH">("ALL");
  const [printingData, setPrintingData] = useState<PharmacyHistoryRecord[] | null>(null);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPharmacyHistory();
      setRecords(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de charger l'historique pharmacie";
      setError(message);
      console.error("Unable to load pharmacy history", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    const interval = window.setInterval(loadHistory, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    let result = [...records];

    if (filterType !== "ALL") {
      result = result.filter((item) => item.type === filterType);
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    if (dateRange === "TODAY") {
      result = result.filter((item) => new Date(item.createdAt) >= startOfToday);
    } else if (dateRange === "WEEK") {
      result = result.filter((item) => new Date(item.createdAt) >= weekAgo);
    } else if (dateRange === "MONTH") {
      result = result.filter((item) => new Date(item.createdAt) >= monthAgo);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((item) =>
        [item.patientName, item.medicationName, item.reference, item.actorName, item.trace, item.status]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    return result;
  }, [records, filterType, dateRange, query]);

  const totals = useMemo(() => {
    const deliveries = filtered.filter((item) => item.type === "DISPENSE");
    const sales = filtered.filter((item) => item.type === "SALE");
    return {
      deliveriesCount: deliveries.length,
      salesCount: sales.length,
      totalAmount: filtered.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      deliveriesAmount: deliveries.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      salesAmount: sales.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      totalRecords: filtered.length,
    };
  }, [filtered]);

  const handlePrintHistory = () => {
    setPrintingData(filtered);
    window.setTimeout(() => {
      const cleanup = () => setPrintingData(null);
      window.addEventListener("afterprint", cleanup, { once: true });
      window.print();
      // Some mobile browsers never emit afterprint.
      window.setTimeout(cleanup, 1500);
    }, 200);
  };

  return (
    <>
      <style>{`
        @media screen { #pharmacy-history-print-area { display: none; } }
        @media print {
          body { margin: 0; padding: 0; background: #fff; }
          #main-content { display: none !important; }
          #pharmacy-history-print-area { display: block !important; }
        }
      `}</style>

      <div id="main-content" className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
        <PageMeta title="Historique pharmacie | D7 Clinique" description="Historique complet des délivrances et ventes de la pharmacie." />
        <PageBreadcrumb pageTitle="Historique pharmacie" />

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Historique pharmacie</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Suivi complet des délivrances et ventes indépendantes, avec traçabilité basée sur la base de données.</p>
            </div>
            <button onClick={handlePrintHistory} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800">
              Imprimer l'historique
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
              <div className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{totals.totalRecords}</div>
              <div className="text-sm text-slate-600">{formatMoney(totals.totalAmount)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs uppercase tracking-wide text-slate-500">Délivrances</div>
              <div className="mt-2 text-xl font-semibold text-emerald-700">{totals.deliveriesCount}</div>
              <div className="text-sm text-slate-600">{formatMoney(totals.deliveriesAmount)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs uppercase tracking-wide text-slate-500">Ventes</div>
              <div className="mt-2 text-xl font-semibold text-blue-700">{totals.salesCount}</div>
              <div className="text-sm text-slate-600">{formatMoney(totals.salesAmount)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs uppercase tracking-wide text-slate-500">Traçabilité</div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">Référence + acteur + lot</div>
              <div className="text-sm text-slate-600">Chaque ligne reste liée à la base.</div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher patient, médicament, référence, acteur..."
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />

            <div className="flex flex-wrap gap-2">
              <button onClick={() => setFilterType("ALL")} className={`rounded-lg px-3 py-2 text-sm ${filterType === "ALL" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>
                Tous
              </button>
              <button onClick={() => setFilterType("DISPENSE")} className={`rounded-lg px-3 py-2 text-sm ${filterType === "DISPENSE" ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>
                Délivrances
              </button>
              <button onClick={() => setFilterType("SALE")} className={`rounded-lg px-3 py-2 text-sm ${filterType === "SALE" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>
                Ventes
              </button>
              <button onClick={() => setDateRange("TODAY")} className={`rounded-lg px-3 py-2 text-sm ${dateRange === "TODAY" ? "bg-sky-600 text-white" : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>Aujourd'hui</button>
              <button onClick={() => setDateRange("WEEK")} className={`rounded-lg px-3 py-2 text-sm ${dateRange === "WEEK" ? "bg-sky-600 text-white" : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>Cette semaine</button>
              <button onClick={() => setDateRange("MONTH")} className={`rounded-lg px-3 py-2 text-sm ${dateRange === "MONTH" ? "bg-sky-600 text-white" : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>Ce mois</button>
              <button onClick={() => setDateRange("ALL")} className={`rounded-lg px-3 py-2 text-sm ${dateRange === "ALL" ? "bg-sky-600 text-white" : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}>Tous les temps</button>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 text-sm text-slate-500">Chargement de l'historique...</div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Patient / Vente</th>
                    <th className="px-3 py-3">Médicament</th>
                    <th className="px-3 py-3">Qté</th>
                    <th className="px-3 py-3">Montant</th>
                    <th className="px-3 py-3">Référence</th>
                    <th className="px-3 py-3">Acteur</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-500">Aucun élément trouvé pour cette recherche.</td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300">
                        <td className="px-3 py-3">{formatDateTime(item.createdAt)}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.type === "DISPENSE" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                            {item.typeLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3">{item.patientName}</td>
                        <td className="px-3 py-3">{item.medicationName}</td>
                        <td className="px-3 py-3">{item.quantity}</td>
                        <td className="px-3 py-3">{formatMoney(item.amount)}</td>
                        <td className="px-3 py-3">{item.reference}</td>
                        <td className="px-3 py-3">{item.actorName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div id="pharmacy-history-print-area" className="p-6">
        {printingData ? <HistoryPrintTemplate records={printingData} /> : null}
      </div>
    </>
  );
}

function HistoryPrintTemplate({ records }: { records: PharmacyHistoryRecord[] }) {
  const totals = records.reduce(
    (summary, record) => ({
      ...summary,
      totalAmount: summary.totalAmount + Number(record.amount || 0),
      deliveriesCount: summary.deliveriesCount + (record.type === "DISPENSE" ? 1 : 0),
      salesCount: summary.salesCount + (record.type === "SALE" ? 1 : 0),
    }),
    { totalAmount: 0, deliveriesCount: 0, salesCount: 0 },
  );

  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#111827", padding: "24px", lineHeight: 1.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #0f172a", paddingBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>D7 CLINIQUE</div>
          <div style={{ fontSize: "13px", color: "#475569", marginTop: "4px" }}>Pharmacie • Historique des activités</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "12px", color: "#475569" }}>
          <div><strong>Document administratif</strong></div>
          <div>Émis le {new Date().toLocaleString("fr-FR")}</div>
          <div>Référence: PHAR-INV-{new Date().toISOString().slice(0, 10).replace(/-/g, "")}</div>
        </div>
      </div>

      <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
        <div style={{ border: "1px solid #e2e8f0", padding: "10px", background: "#f8fafc" }}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b" }}>Total d’entrées</div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>{records.length}</div>
        </div>
        <div style={{ border: "1px solid #e2e8f0", padding: "10px", background: "#f8fafc" }}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b" }}>Délivrances</div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>{totals.deliveriesCount}</div>
        </div>
        <div style={{ border: "1px solid #e2e8f0", padding: "10px", background: "#f8fafc" }}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b" }}>Ventes directes</div>
          <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px" }}>{totals.salesCount}</div>
        </div>
      </div>

      <div style={{ marginTop: "16px", fontSize: "13px", color: "#334155" }}>
        Ce document récapitule l’ensemble des opérations de délivrance et de vente directe enregistrées dans la pharmacie, avec leur traçabilité associée.
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px", fontSize: "11px" }}>
        <thead>
          <tr style={{ backgroundColor: "#0f172a", color: "#ffffff" }}>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Date</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Type</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Patient / Vente</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Médicament</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Qté</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Montant</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Référence</th>
            <th style={{ border: "1px solid #cbd5e1", padding: "8px", textAlign: "left" }}>Acteur</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{formatDateTime(record.createdAt)}</td>
              <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{record.typeLabel}</td>
              <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{record.patientName}</td>
              <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{record.medicationName}</td>
              <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{record.quantity}</td>
              <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{formatMoney(record.amount)}</td>
              <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{record.reference}</td>
              <td style={{ border: "1px solid #e2e8f0", padding: "8px" }}>{record.actorName}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#334155" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Montant total</div>
          <div>{formatMoney(totals.totalAmount)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>Validation</div>
          <div style={{ marginTop: "24px", borderTop: "1px solid #94a3b8", width: "180px", paddingTop: "6px" }}>Signature / cachet</div>
        </div>
      </div>
    </div>
  );
}
