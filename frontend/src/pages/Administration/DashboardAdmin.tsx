import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bed, Banknote, FileText, Hospital, Stethoscope, UsersRound } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge, formatDate, formatMoney } from "./adminUi";

type DashboardPayload = {
  generatedAt?: string;
  metrics?: {
    activePatients: number;
    consultationsToday: number;
    hospitalizations: number;
    invoicesMonth: number;
    paymentsMonth: number;
    availableBeds: number;
    criticalAlerts: number;
  };
  alerts?: {
    criticalStock?: Array<{ id: string; medication?: string; quantity?: number; threshold?: number }>;
    urgentPatients?: Array<{ id: string; name?: string; priority?: string; workflowStatus?: string }>;
    beds?: { available: number; total: number };
  };
  performanceByService?: Array<{
    id: string;
    name: string;
    staffCount: number;
    responsibleCount: number;
    patientCount: number;
    active?: boolean;
    currentTarif?: string | number | null;
  }>;
  recent?: {
    consultations?: Array<{ id: string; createdAt?: string; patient?: { firstName?: string; lastName?: string }; provider?: { displayName?: string }; status?: string }>;
    hospitalizations?: Array<{ id: string; admittedAt?: string; patient?: { firstName?: string; lastName?: string }; status?: string; ServiceUnit?: { name?: string } }>;
    invoices?: Array<{ id: string; issuedAt?: string; totalAmount?: string | number; status?: string; patient?: { firstName?: string; lastName?: string } }>;
    payments?: Array<{ id: string; paidAt?: string; amount?: string | number; method?: string; invoice?: { patient?: { firstName?: string; lastName?: string } } }>;
  };
};

const emptyMetrics = {
  activePatients: 0,
  consultationsToday: 0,
  hospitalizations: 0,
  invoicesMonth: 0,
  paymentsMonth: 0,
  availableBeds: 0,
  criticalAlerts: 0,
};

export default function DashboardAdmin() {
  const [dashboard, setDashboard] = useState<DashboardPayload>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await apiFetch<DashboardPayload>("/administration/dashboard", undefined, 20000);
      setDashboard(data);
    } catch (err: any) {
      setDashboard({});
      setError(err?.message || "Impossible de charger les donnees du tableau de bord.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    window.addEventListener("d7:administrationUpdated", load);
    window.addEventListener("d7:patient.updated", load);
    window.addEventListener("d7:billingDataUpdated", load);
    window.addEventListener("d7:clinicalDataUpdated", load);
    return () => {
      window.removeEventListener("d7:administrationUpdated", load);
      window.removeEventListener("d7:patient.updated", load);
      window.removeEventListener("d7:billingDataUpdated", load);
      window.removeEventListener("d7:clinicalDataUpdated", load);
    };
  }, []);

  const metrics = dashboard.metrics || emptyMetrics;
  const performance = useMemo(() => {
    const rows = dashboard.performanceByService || [];
    return rows
      .slice()
      .sort((a, b) => (b.patientCount + b.staffCount) - (a.patientCount + a.staffCount))
      .slice(0, 10);
  }, [dashboard.performanceByService]);

  const maxPerformance = Math.max(1, ...performance.map((service) => service.patientCount + service.staffCount));

  return (
    <AdminPageShell
      title="Dashboard admin"
      subtitle="Vue d'ensemble operationnelle, financiere et clinique de la structure."
      actions={<button onClick={load} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">{isLoading ? "Chargement" : "Actualiser"}</button>}
    >
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <StatCard icon={<UsersRound size={20} />} label="Patients actifs" value={metrics.activePatients} />
        <StatCard icon={<Stethoscope size={20} />} label="Consultations du jour" value={metrics.consultationsToday} tone="blue" />
        <StatCard icon={<Hospital size={20} />} label="Hospitalisations" value={metrics.hospitalizations} tone="violet" />
        <StatCard icon={<FileText size={20} />} label="Factures mois" value={metrics.invoicesMonth} tone="amber" />
        <StatCard icon={<Banknote size={20} />} label="Paiements mois" value={formatMoney(metrics.paymentsMonth)} tone="green" />
        <StatCard icon={<Bed size={20} />} label="Lits disponibles" value={metrics.availableBeds} tone="green" />
        <StatCard icon={<AlertTriangle size={20} />} label="Alertes critiques" value={metrics.criticalAlerts} tone={metrics.criticalAlerts ? "red" : "green"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel title="Performance par service" subtitle="Graphique base sur patients rattaches et membres d'equipe.">
          <div className="space-y-4">
            {performance.length === 0 ? (
              <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
                Aucun service disponible depuis la base de donnees.
              </div>
            ) : performance.map((service) => {
              const value = service.patientCount + service.staffCount;
              const width = Math.max(6, Math.round((value / maxPerformance) * 100));
              return (
                <div key={service.id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{service.name}</span>
                    <span className="whitespace-nowrap text-slate-500">{service.patientCount} patient(s), {service.staffCount} agent(s)</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-3 rounded-full bg-blue-600 transition-all" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Alertes">
          <div className="space-y-3">
            <AlertLine label="Stock critique" value={dashboard.alerts?.criticalStock?.length || 0} tone={(dashboard.alerts?.criticalStock?.length || 0) ? "red" : "green"} />
            <AlertLine label="Lits disponibles" value={`${dashboard.alerts?.beds?.available || 0}/${dashboard.alerts?.beds?.total || 0}`} tone={(dashboard.alerts?.beds?.available || 0) ? "green" : "amber"} />
            <AlertLine label="Cas urgents/prioritaires" value={dashboard.alerts?.urgentPatients?.length || 0} tone={(dashboard.alerts?.urgentPatients?.length || 0) ? "red" : "green"} />
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Activite clinique recente">
          <DataTable
            headers={["Patient", "Acte", "Date", "Statut"]}
            rows={[
              ...(dashboard.recent?.consultations || []).slice(0, 5).map((item) => [
                patientName(item.patient),
                item.provider?.displayName || "Consultation",
                formatDate(item.createdAt),
                <StatusBadge key="status" label={item.status || "-"} tone="blue" />,
              ]),
              ...(dashboard.recent?.hospitalizations || []).slice(0, 5).map((item) => [
                patientName(item.patient),
                item.ServiceUnit?.name || "Hospitalisation",
                formatDate(item.admittedAt),
                <StatusBadge key="status" label={item.status || "-"} tone="violet" />,
              ]),
            ]}
          />
        </Panel>

        <Panel title="Activite financiere recente">
          <DataTable
            headers={["Patient", "Operation", "Montant", "Date"]}
            rows={[
              ...(dashboard.recent?.invoices || []).slice(0, 5).map((item) => [
                patientName(item.patient),
                `Facture ${item.status || ""}`,
                formatMoney(item.totalAmount),
                formatDate(item.issuedAt),
              ]),
              ...(dashboard.recent?.payments || []).slice(0, 5).map((item) => [
                patientName(item.invoice?.patient),
                item.method || "Paiement",
                formatMoney(item.amount),
                formatDate(item.paidAt),
              ]),
            ]}
          />
        </Panel>
      </div>
    </AdminPageShell>
  );
}

function AlertLine({ label, value, tone }: { label: string; value: React.ReactNode; tone: "red" | "green" | "amber" }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <StatusBadge label={String(value)} tone={tone} />
    </div>
  );
}

function patientName(patient?: { firstName?: string; lastName?: string }) {
  return [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || "-";
}
