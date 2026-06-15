import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

export default function DashboardPharmacie() {
  const [medications, setMedications] = useState<any[]>([]);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const [meds, consults] = await Promise.all([
        apiFetch<any[]>("/pharmacy").catch(() => []),
        apiFetch<any[]>("/consultations").catch(() => []),
      ]);
      setMedications(meds);
      setConsultations(consults);
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
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="Ordonnances en attente" value={pending.length} tone="amber" />
          <Metric label="Ordonnances servies" value={prescriptions.length - pending.length} tone="green" />
          <Metric label="Medicaments" value={medications.length} />
          <Metric label="Stock faible" value={lowStock.length} tone="red" />
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Ordonnances">
          <Table headers={["Statut", "Date", "Instruction"]} rows={prescriptions.slice(0, 15).map((item) => [
            item.status || "-",
            item.prescribingDate ? new Date(item.prescribingDate).toLocaleString("fr-FR") : "-",
            item.instruction || item.lineItems?.map((line: any) => [line.dosage, line.frequency, line.notes].filter(Boolean).join(" - ")).join(", ") || "-",
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
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" | "green" | "red" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    amber: "text-amber-700 dark:text-amber-300",
    green: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
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
