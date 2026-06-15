import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../config/api";
import { fetchAllInvoices, fetchAllPayments } from "../../api/cashier";
import { fetchHospitalizationsFromDatabase, fetchPatientsFromDatabase, fetchServices } from "../../api/reception";

export default function DashboardAdmin() {
  const [patients, setPatients] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [hospitalizations, setHospitalizations] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const [patientsData, usersData, servicesData, invoicesData, paymentsData, hospitalizationsData, medicationsData] =
        await Promise.all([
          fetchPatientsFromDatabase().catch(() => []),
          apiFetch<any[]>("/users").catch(() => []),
          fetchServices().catch(() => []),
          fetchAllInvoices().catch(() => []),
          fetchAllPayments().catch(() => []),
          fetchHospitalizationsFromDatabase().catch(() => []),
          apiFetch<any[]>("/pharmacy").catch(() => []),
        ]);
      setPatients(patientsData);
      setUsers(usersData);
      setServices(servicesData);
      setInvoices(invoicesData);
      setPayments(paymentsData);
      setHospitalizations(hospitalizationsData);
      setMedications(medicationsData);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("d7:patient.created", handler);
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:notification.created", handler);
    return () => {
      window.removeEventListener("d7:patient.created", handler);
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:notification.created", handler);
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  const metrics = useMemo(() => {
    const paymentsToday = payments.filter((payment) => (payment.paidAt || payment.createdAt || "").slice(0, 10) === today);
    const paymentsMonth = payments.filter((payment) => (payment.paidAt || payment.createdAt || "").slice(0, 7) === month);
    const admittedToday = patients.filter((patient) => (patient.createdAt || "").slice(0, 10) === today);
    return {
      patientsToday: admittedToday.length,
      waiting: patients.filter((patient) => String(patient.workflowStatus || "").includes("EN_ATTENTE")).length,
      hospitalized: hospitalizations.filter((item) => item.status === "ADMITTED").length,
      revenueToday: paymentsToday.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      revenueMonth: paymentsMonth.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      unpaidInvoices: invoices.filter((invoice) => Number(invoice.balanceDue || 0) > 0).length,
    };
  }, [hospitalizations, invoices, month, patients, payments, today]);

  const getRoleLabel = (user: any) => {
    const isFemale = user.gender === "F";

    switch (user.primaryRole) {
      case "SUPER_ADMIN":
        return null; // ne pas afficher

      case "ADMIN":
        return "Administrateur";

      case "RECEPTIONIST":
        return "Réceptionniste";

      case "CASHIER":
        return isFemale ? "Caissière" : "Caissier";

      case "NURSE":
        return isFemale ? "Infirmière" : "Infirmier";

      case "PHYSICIAN":
        return "Médecin";

      case "PHARMACIST":
        return "Pharmacien";

      case "LAB_TECHNICIAN":
        return "Laborantin";

      case "RADIOLOGIST":
        return "Radiologue";

      case "SURGEON":
        return "Chirurgien";

      case "ANESTHESIOLOGIST":
        return "Anesthésiste";

      case "PATIENT":
        return "Patient";

      default:
        return user.primaryRole || "-";
    }
    
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Directeur operationnel</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Tableau de bord administration</h1>
          </div>
          <button onClick={load} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
            {isLoading ? "Chargement" : "Actualiser"}
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Patients aujourd'hui" value={metrics.patientsToday} />
          <Metric label="Patients en attente" value={metrics.waiting} tone="amber" />
          <Metric label="Hospitalises" value={metrics.hospitalized} tone="blue" />
          <Metric label="Recettes jour" value={`${metrics.revenueToday.toLocaleString("fr-FR")} USD`} tone="green" />
          <Metric label="Recettes mois" value={`${metrics.revenueMonth.toLocaleString("fr-FR")} USD`} tone="green" />
          <Metric label="Factures impayees" value={metrics.unpaidInvoices} tone="red" />
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Gestion du personnel">
          <DataTable
            headers={["Nom", "Email", "Telephone", "Role", "Statut"]}
            rows={users
              .filter((user) => user.primaryRole !== "SUPER_ADMIN")
              .slice(0, 10)
              .map((user) => [
                user.displayName || `${user.firstName || ""} ${user.lastName || ""}`,
                user.email,
                user.phone || "-",
                getRoleLabel(user),
                user.status || "-",
              ])}
          />
        </Panel>

        <Panel title="Services, responsables et tarifs">
          <DataTable
            headers={["Service", "Responsables", "Personnel", "Tarifs"]}
            rows={services.slice(0, 10).map((service) => [
              service.name,
              (service.responsables || []).map((item: any) => item.user?.displayName || item.user?.username).filter(Boolean).join(", ") || "-",
              String((service.staff || []).length || 0),
              (service.tarifs || []).map((tarif: any) => `${tarif.label || tarif.type}: ${Number(tarif.amount || tarif.price || 0).toLocaleString("fr-FR")}`).join(", ") || "-",
            ])}
          />
        </Panel>

        <Panel title="Stock pharmaceutique">
          <DataTable
            headers={["Code", "Nom", "Dosage", "Unite", "Fabricant"]}
            rows={medications.slice(0, 10).map((medication) => [
              medication.code || "-",
              medication.name || "-",
              medication.dosage || "-",
              medication.unit || "-",
              medication.manufacturer || "-",
            ])}
          />
        </Panel>

        <Panel title="Rapports operationnels">
          <DataTable
            headers={["Indicateur", "Valeur"]}
            rows={[
              ["Patients", patients.length],
              ["Services", services.length],
              ["Utilisateurs", users.length],
              ["Hospitalisations", hospitalizations.length],
              ["Medicaments catalogue", medications.length],
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "amber" | "blue" | "green" | "red" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-emerald-700 dark:text-emerald-300",
    red: "text-red-700 dark:text-red-300",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-950">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-slate-500">Aucune donnee.</td></tr>
          ) : rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 text-slate-700 dark:text-slate-200">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
