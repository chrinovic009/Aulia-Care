import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../config/api";
import { fetchAllInvoices, fetchAllPayments } from "../../api/cashier";
import { fetchHospitalizationsFromDatabase, fetchPatientsFromDatabase, fetchServices } from "../../api/reception";

const tabs = ["Vue globale", "Finances", "Performances", "Alertes", "Rapports"];

export default function DashboardSupAdmin() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [patients, setPatients] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [hospitalizations, setHospitalizations] = useState<any[]>([]);
  const [medications, setMedications] = useState<any[]>([]);

  const load = async () => {
    const [patientsData, usersData, servicesData, paymentsData, invoicesData, hospitalizationsData, medicationsData] =
      await Promise.all([
        fetchPatientsFromDatabase().catch(() => []),
        apiFetch<any[]>("/users").catch(() => []),
        fetchServices().catch(() => []),
        fetchAllPayments().catch(() => []),
        fetchAllInvoices().catch(() => []),
        fetchHospitalizationsFromDatabase().catch(() => []),
        apiFetch<any[]>("/pharmacy").catch(() => []),
      ]);
    setPatients(patientsData);
    setUsers(usersData);
    setServices(servicesData);
    setPayments(paymentsData);
    setInvoices(invoicesData);
    setHospitalizations(hospitalizationsData);
    setMedications(medicationsData);
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
    const workflow = (status: string) => patients.filter((patient) => patient.workflowStatus === status).length;
    return {
      patientsToday: patients.filter((patient) => (patient.createdAt || "").slice(0, 10) === today).length,
      patientsMonth: patients.filter((patient) => (patient.createdAt || "").slice(0, 7) === month).length,
      consultationsToday: patients.filter((patient) => (patient.consultations || []).some((item: any) => (item.createdAt || "").slice(0, 10) === today)).length,
      hospitalized: hospitalizations.filter((item) => item.status === "ADMITTED").length,
      revenueToday: paymentsToday.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      revenueMonth: paymentsMonth.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      unpaid: invoices.reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0),
      workflow,
    };
  }, [hospitalizations, invoices, month, patients, payments, today]);

  const criticalAlerts = [
    ...medications.filter((item) => Number(item.stockQuantity || item.quantity || 0) <= Number(item.criticalLevel || 3)).map((item) => `Stock critique: ${item.name}`),
    ...invoices.filter((invoice) => Number(invoice.balanceDue || 0) > 1000).map((invoice) => `Facture impayee importante: ${Number(invoice.balanceDue).toLocaleString("fr-FR")}`),
    ...services.filter((service) => !service.responsables?.length).map((service) => `Service sans responsable: ${service.name}`),
  ];

  const roleLabels: Record<string, string> = {
    PHYSICIAN: "Médecins",
    NURSE: "Infirmiers",
    PHARMACIST: "Pharmaciens",
    RECEPTIONIST: "Réceptionnistes",
    CASHIER: "Caissiers",
    ADMIN: "Administrateurs",
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase text-slate-500">DG de l'hopital</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Vue strategique D7 Clinic</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeTab === tab ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
              {tab}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        {activeTab === "Vue globale" && (
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Patients aujourd'hui" value={metrics.patientsToday} />
            <Metric label="Patients ce mois" value={metrics.patientsMonth} />
            <Metric label="Consultations aujourd'hui" value={metrics.consultationsToday} />
            <Metric label="Hospitalises" value={metrics.hospitalized} />
            <Metric label="En attente caisse" value={metrics.workflow("EN_ATTENTE_DE_PAIEMENT")} tone="amber" />
            <Metric label="En attente infirmier" value={metrics.workflow("EN_ATTENTE_INFIRMERIE")} tone="blue" />
            <Metric label="En attente medecin" value={metrics.workflow("EN_ATTENTE_MEDECIN")} tone="blue" />
            <Metric label="Pharmacie" value={metrics.workflow("EN_PHARMACIE")} tone="green" />
          </div>
        )}

        {activeTab === "Finances" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Encaisse aujourd'hui" value={`${metrics.revenueToday.toLocaleString("fr-FR")} USD`} tone="green" />
            <Metric label="Encaisse ce mois" value={`${metrics.revenueMonth.toLocaleString("fr-FR")} USD`} tone="green" />
            <Metric label="Factures impayees" value={`${metrics.unpaid.toLocaleString("fr-FR")} USD`} tone="red" />
          </div>
        )}

        {activeTab === "Performances" && (
          <Table
            headers={["Role", "Nombre utilisateurs"]}
            rows={[
              "ADMIN",
              "PHYSICIAN",
              "NURSE",
              "PHARMACIST",
              "RECEPTIONIST",
              "CASHIER",
            ].map((role) => [
              roleLabels[role],
              users.filter((user) => user.primaryRole === role).length,
            ])}
          />
        )}

        {activeTab === "Alertes" && (
          <div className="space-y-2">
            {criticalAlerts.length === 0 ? <p className="text-sm text-slate-500">Aucune alerte critique.</p> : criticalAlerts.map((alert) => <div key={alert} className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{alert}</div>)}
          </div>
        )}

        {activeTab === "Rapports" && (
          <Table headers={["Rapport", "Base"]} rows={[
            ["Journalier", "Patients, paiements, consultations"],
            ["Hebdomadaire", "Activite par service"],
            ["Mensuel", "Revenus, hospitalisations, stock"],
            ["Annuel", "Performance globale"],
          ]} />
        )}
      </section>
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
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p></div>;
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{headers.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2">{cell}</td>)}</tr>)}</tbody></table>;
}
