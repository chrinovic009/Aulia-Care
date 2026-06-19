import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchPatientsFromDatabase } from "../../api/reception";

type AdmissionRecord = {
  id: string;
  patient: string;
  service: string;
  doctor: string;
  entryDate: string;
  entryHour: number;
  reason: string;
  status: string;
  insurance: string;
  createdAt?: string;
};

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)) : "-";

const patientName = (patient: any) =>
  [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ") || patient.name || "Patient";

const serviceName = (patient: any) =>
  patient.service?.name || patient.serviceName || patient.service || "Non affecte";

const doctorName = (patient: any) =>
  patient.doctor ||
  patient.physician?.displayName ||
  patient.consultations?.[0]?.provider?.displayName ||
  [patient.consultations?.[0]?.provider?.firstName, patient.consultations?.[0]?.provider?.lastName].filter(Boolean).join(" ") ||
  "-";

const reasonText = (patient: any) =>
  patient.reason || patient.visitReason || patient.motif || patient.admissionType || patient.priority || "Reception";

const toAdmissionRecord = (patient: any): AdmissionRecord => {
  const createdAt = patient.arrivalAt || patient.createdAt;
  const createdDate = createdAt ? new Date(createdAt) : new Date();
  return {
    id: patient.externalId || patient.id,
    patient: patientName(patient),
    service: serviceName(patient),
    doctor: doctorName(patient),
    entryDate: formatDate(createdAt),
    entryHour: createdDate.getHours(),
    reason: reasonText(patient),
    status: patient.workflowStatus || patient.status || "ENREGISTRE",
    insurance: patient.insuranceProvider || patient.insurance || "-",
    createdAt,
  };
};

export default function HistoriqueReception() {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<AdmissionRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<AdmissionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const patients = await fetchPatientsFromDatabase();
      const mapped = (patients || [])
        .map(toAdmissionRecord)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setRecords(mapped);
      setSelectedRecord((current) => current || mapped[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger l'historique depuis la base.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    const handler = () => loadHistory();
    window.addEventListener("d7:patient.created", handler);
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:patientRecordsUpdated", handler);
    return () => {
      window.removeEventListener("d7:patient.created", handler);
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:patientRecordsUpdated", handler);
    };
  }, []);

  const filteredRecords = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return records;
    return records.filter((record) =>
      [record.id, record.patient, record.service, record.doctor, record.reason, record.status, record.insurance]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [records, search]);

  const metrics = useMemo(() => {
    const now = new Date();
    const month = records.filter((record) => {
      if (!record.createdAt) return false;
      const created = new Date(record.createdAt);
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;
    const urgent = records.filter((record) => ["urgent", "urgence", "prioritaire", "critical"].some((key) => record.reason.toLowerCase().includes(key) || record.status.toLowerCase().includes(key))).length;
    const voucher = records.filter((record) => record.reason.toUpperCase().includes("BON_PARAMEDICAL")).length;
    const uniquePatients = new Set(records.map((record) => record.patient)).size;
    return { total: records.length, month, urgent, voucher, uniquePatients };
  }, [records]);

  const frequentAdmissions = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((record) => counts.set(record.patient, (counts.get(record.patient) || 0) + 1));
    return Array.from(counts.entries())
      .map(([patient, count]) => ({ patient, count }))
      .filter((item) => item.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [records]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Historique reception | D7 Clinique" description="Historique reception alimente par PostgreSQL." />
      <PageBreadcrumb pageTitle="Historique reception" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Source PostgreSQL</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Historique des admissions</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Patients recus, bons paramedicaux, urgences et orientations enregistres par la reception.</p>
          </div>
          <button onClick={loadHistory} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Actualiser</button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-5">
          <Metric label="Admissions" value={metrics.total} />
          <Metric label="Ce mois" value={metrics.month} tone="blue" />
          <Metric label="Patients uniques" value={metrics.uniquePatients} tone="green" />
          <Metric label="Urgences" value={metrics.urgent} tone="red" />
          <Metric label="Bons paramedicaux" value={metrics.voucher} tone="amber" />
        </div>
      </section>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher patient, service, statut, assurance..."
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white md:max-w-md"
            />
            <p className="text-sm text-slate-500">{filteredRecords.length} entree(s)</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="py-3 pr-4">Dossier</th>
                  <th className="py-3 pr-4">Patient</th>
                  <th className="py-3 pr-4">Service</th>
                  <th className="py-3 pr-4">Medecin</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Statut</th>
                  <th className="py-3 pr-4">Assurance</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-500">Chargement...</td></tr>
                ) : filteredRecords.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-500">Aucune admission trouvee.</td></tr>
                ) : filteredRecords.map((record) => (
                  <tr key={record.id} onClick={() => setSelectedRecord(record)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-950">
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">{record.id}</td>
                    <td className="py-3 pr-4">{record.patient}</td>
                    <td className="py-3 pr-4">{record.service}</td>
                    <td className="py-3 pr-4">{record.doctor}</td>
                    <td className="py-3 pr-4">{record.entryDate}</td>
                    <td className="py-3 pr-4"><StatusBadge status={record.status} /></td>
                    <td className="py-3 pr-4">{record.insurance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold text-slate-900 dark:text-white">Detail selection</h2>
            {selectedRecord ? (
              <div className="mt-4 space-y-3">
                <Info label="Patient" value={selectedRecord.patient} />
                <Info label="Service" value={selectedRecord.service} />
                <Info label="Motif" value={selectedRecord.reason} />
                <Info label="Heure d'arrivee" value={`${selectedRecord.entryHour}h`} />
                <Info label="Statut" value={<StatusBadge status={selectedRecord.status} />} />
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Selectionnez une admission.</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold text-slate-900 dark:text-white">Patients frequents</h2>
            <div className="mt-4 space-y-3">
              {frequentAdmissions.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune recurrence detectee.</p>
              ) : frequentAdmissions.map((item) => (
                <div key={item.patient} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                  <span className="font-medium text-slate-900 dark:text-white">{item.patient}</span>
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">{item.count}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "blue" | "green" | "red" | "amber" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
    amber: "text-amber-700 dark:text-amber-300",
  };
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p></div>;
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><div className="mt-1 font-medium text-slate-900 dark:text-white">{value}</div></div>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone = normalized.includes("TERMINE") || normalized.includes("ACTIVE")
    ? "bg-emerald-100 text-emerald-700"
    : normalized.includes("PAIEMENT") || normalized.includes("ATTENTE")
    ? "bg-amber-100 text-amber-700"
    : normalized.includes("ANNULE")
    ? "bg-red-100 text-red-700"
    : "bg-blue-100 text-blue-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}
