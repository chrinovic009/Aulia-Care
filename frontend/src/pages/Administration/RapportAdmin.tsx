import { useEffect, useMemo, useState } from "react";
import { Activity, Banknote, FileText, Hospital, UsersRound } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, formatMoney } from "./adminUi";

type ReportPayload = {
  patients?: Array<{ createdAt?: string; workflowStatus?: string; priority?: string }>;
  users?: Array<{ primaryRole?: string; status?: string }>;
  services?: Array<{ name: string; staff?: unknown[]; responsables?: unknown[] }>;
  invoices?: Array<{ status?: string; totalAmount?: string | number; balanceDue?: string | number }>;
  payments?: Array<{ amount?: string | number; paidAt?: string; createdAt?: string }>;
  hospitalizations?: Array<{ status?: string }>;
  consultations?: Array<{ createdAt?: string; status?: string }>;
  prescriptions?: Array<{ status?: string; createdAt?: string }>;
  insurances?: Array<{ status?: string; createdAt?: string; claimedAmount?: string | number; approvedAmount?: string | number }>;
  attendances?: Array<{ status?: string; createdAt?: string }>;
  leaveRequests?: Array<{ status?: string; leaveType?: string; requestedAt?: string }>;
  payrolls?: Array<{ netAmount?: string | number; status?: string; createdAt?: string }>;
  auditTrails?: Array<{ action?: string; entityType?: string; createdAt?: string }>;
  medications?: unknown[];
  departments?: unknown[];
  rooms?: Array<{ beds?: unknown[] }>;
};

export default function RapportAdmin() {
  const [payload, setPayload] = useState<ReportPayload>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = () => apiFetch<ReportPayload>("/administration/reports")
      .then(setPayload)
      .catch(() => setPayload({}))
      .finally(() => setIsLoading(false));
    load();
    window.addEventListener("d7:administrationUpdated", load);
    window.addEventListener("d7:patient.updated", load);
    window.addEventListener("d7:billingDataUpdated", load);
    return () => {
      window.removeEventListener("d7:administrationUpdated", load);
      window.removeEventListener("d7:patient.updated", load);
      window.removeEventListener("d7:billingDataUpdated", load);
    };
  }, []);

  const metrics = useMemo(() => {
    const patients = payload.patients || [];
    const payments = payload.payments || [];
    const invoices = payload.invoices || [];
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);
    return {
      patientsToday: patients.filter((patient) => patient.createdAt?.slice(0, 10) === today).length,
      urgent: patients.filter((patient) => ["urgent", "urgence", "prioritaire"].includes(String(patient.priority || "").toLowerCase())).length,
      revenueMonth: payments.filter((payment) => (payment.paidAt || payment.createdAt || "").slice(0, 7) === month).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      unpaid: invoices.reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0),
      staff: (payload.users || []).filter((user) => user.primaryRole !== "SUPER_ADMIN" && user.primaryRole !== "PATIENT").length,
      hospitalized: (payload.hospitalizations || []).filter((item) => item.status === "ADMITTED").length,
      consultations: payload.consultations?.length || 0,
      prescriptions: payload.prescriptions?.length || 0,
      payroll: (payload.payrolls || []).reduce((sum, payroll) => sum + Number(payroll.netAmount || 0), 0),
      audit: payload.auditTrails?.length || 0,
    };
  }, [payload]);

  const exportReport = () => {
    const rows = [
      ["Indicateur", "Valeur"],
      ["Patients", payload.patients?.length || 0],
      ["Employes", metrics.staff],
      ["Services", payload.services?.length || 0],
      ["Hospitalisations", payload.hospitalizations?.length || 0],
      ["Consultations", metrics.consultations],
      ["Prescriptions", metrics.prescriptions],
      ["Recettes mois", metrics.revenueMonth],
      ["Reste a encaisser", metrics.unpaid],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rapport-administration-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminPageShell
      title="Rapports"
      subtitle="Synthese operationnelle, financiere, RH et clinique pour la direction administrative."
      actions={<button onClick={exportReport} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Exporter CSV</button>}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={<UsersRound size={20} />} label="Patients du jour" value={metrics.patientsToday} />
        <StatCard icon={<Activity size={20} />} label="Cas prioritaires" value={metrics.urgent} tone="red" />
        <StatCard icon={<Banknote size={20} />} label="Recettes mois" value={formatMoney(metrics.revenueMonth)} tone="green" />
        <StatCard icon={<FileText size={20} />} label="Reste a encaisser" value={formatMoney(metrics.unpaid)} tone="amber" />
        <StatCard icon={<UsersRound size={20} />} label="Personnel" value={metrics.staff} tone="blue" />
        <StatCard icon={<Hospital size={20} />} label="Hospitalises" value={metrics.hospitalized} tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Rapport administratif">
          <DataTable
            headers={["Indicateur", "Valeur"]}
            empty={isLoading ? "Chargement des rapports..." : "Aucune donnee."}
            rows={[
              ["Patients", payload.patients?.length || 0],
              ["Employes", metrics.staff],
              ["Services", payload.services?.length || 0],
              ["Departements", payload.departments?.length || 0],
              ["Salles", payload.rooms?.length || 0],
              ["Medicaments au catalogue", payload.medications?.length || 0],
              ["Consultations", metrics.consultations],
              ["Prescriptions", metrics.prescriptions],
              ["Traces audit", metrics.audit],
            ]}
          />
        </Panel>

        <Panel title="Services et capacites">
          <DataTable
            headers={["Service", "Equipe", "Responsables"]}
            rows={(payload.services || []).map((service) => [
              service.name,
              service.staff?.length || 0,
              service.responsables?.length || 0,
            ])}
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Rapports medicaux">
          <DataTable
            headers={["Indicateur", "Volume"]}
            rows={[
              ["Consultations", payload.consultations?.length || 0],
              ["Hospitalisations", payload.hospitalizations?.length || 0],
              ["Prescriptions", payload.prescriptions?.length || 0],
              ["Assurances", payload.insurances?.length || 0],
            ]}
          />
        </Panel>

        <Panel title="Rapports RH">
          <DataTable
            headers={["Indicateur", "Valeur"]}
            rows={[
              ["Presences suivies", payload.attendances?.length || 0],
              ["Demandes de conge", payload.leaveRequests?.length || 0],
              ["Paie totale", formatMoney(metrics.payroll)],
              ["Employes actifs", (payload.users || []).filter((user) => user.status === "ACTIVE" && user.primaryRole !== "PATIENT" && user.primaryRole !== "SUPER_ADMIN").length],
            ]}
          />
        </Panel>

        <Panel title="Rapports financiers">
          <DataTable
            headers={["Indicateur", "Montant"]}
            rows={[
              ["Factures emises", payload.invoices?.length || 0],
              ["Paiements recus", payload.payments?.length || 0],
              ["Creances restantes", formatMoney(metrics.unpaid)],
              ["Recettes mensuelles", formatMoney(metrics.revenueMonth)],
            ]}
          />
        </Panel>

        <Panel title="Audit trail">
          <DataTable
            headers={["Action", "Entite", "Date"]}
            rows={(payload.auditTrails || []).slice(0, 20).map((audit) => [
              audit.action || "-",
              audit.entityType || "-",
              audit.createdAt ? new Date(audit.createdAt).toLocaleString("fr-FR") : "-",
            ])}
          />
        </Panel>
      </div>
    </AdminPageShell>
  );
}
