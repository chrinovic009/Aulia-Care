import { useEffect, useMemo, useState } from "react";
import { Building2, FileText, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge, formatDate, formatMoney } from "../Administration/adminUi";
import {
  SubscriptionCompany,
  SubscriptionEmployee,
  admitSubscriptionEmployee,
  createSubscriptionCompany,
  createSubscriptionEmployee,
  fetchAdmissibleSubscriptionEmployees,
  fetchSubscriptionCompanies,
  fetchSubscriptionCompany,
  generateMonthlySubscriptionInvoice,
} from "../../api/subscriptions";

const statusTone = (status?: string) => {
  if (status === "ACTIVE" || status === "ISSUED") return "green" as const;
  if (status === "SUSPENDED" || status === "DRAFT") return "amber" as const;
  if (status === "INACTIVE" || status === "CANCELLED") return "red" as const;
  return "slate" as const;
};

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

export default function AbonnementsReception() {
  const [companies, setCompanies] = useState<SubscriptionCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<SubscriptionCompany | null>(null);
  const [admissibleEmployees, setAdmissibleEmployees] = useState<SubscriptionEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: "", legalName: "", contractNumber: "", phone: "", email: "", contactName: "", billingDay: "30" });
  const [employeeForm, setEmployeeForm] = useState({ firstName: "", lastName: "", middleName: "", gender: "", profession: "", dateOfBirth: "", age: "", policyNumber: "", employeeNumber: "", phone: "", email: "" });
  const [admissionForm, setAdmissionForm] = useState({ consultationKind: "CONSULTATION_GENERALE", gender: "", dateOfBirth: "", phone: "", email: "", address: "", nationality: "", priority: "normal" });
  const [invoicePeriod, setInvoicePeriod] = useState({ month: String(currentMonth), year: String(currentYear) });

  const selectedEmployee = useMemo(
    () => admissibleEmployees.find((employee) => employee.id === selectedEmployeeId) || null,
    [admissibleEmployees, selectedEmployeeId],
  );

  const load = async (companyId = selectedCompanyId) => {
    const data = await fetchSubscriptionCompanies();
    setCompanies(data);
    const nextCompanyId = companyId || data[0]?.id || "";
    setSelectedCompanyId(nextCompanyId);
    if (nextCompanyId) {
      const details = await fetchSubscriptionCompany(nextCompanyId);
      setSelectedCompany(details);
      const employees = await fetchAdmissibleSubscriptionEmployees(nextCompanyId);
      setAdmissibleEmployees(employees);
      setSelectedEmployeeId((current) => current || employees[0]?.id || "");
    } else {
      setSelectedCompany(null);
      setAdmissibleEmployees([]);
    }
  };

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Impossible de charger les abonnements."));
  }, []);

  const saveCompany = async () => {
    setMessage(null);
    const created = await createSubscriptionCompany(companyForm);
    setCompanyForm({ name: "", legalName: "", contractNumber: "", phone: "", email: "", contactName: "", billingDay: "30" });
    setMessage("Entreprise abonnée enregistrée.");
    await load(created.id);
  };

  const saveEmployee = async () => {
    if (!selectedCompanyId) return;
    setMessage(null);
    await createSubscriptionEmployee(selectedCompanyId, { ...employeeForm, age: employeeForm.age ? Number(employeeForm.age) : undefined });
    setEmployeeForm({ firstName: "", lastName: "", middleName: "", gender: "", profession: "", dateOfBirth: "", age: "", policyNumber: "", employeeNumber: "", phone: "", email: "" });
    setMessage("Employé abonné ajouté à l'entreprise.");
    await load(selectedCompanyId);
  };

  const prepareEmployeeAdmission = (employee: SubscriptionEmployee) => {
    setSelectedEmployeeId(employee.id);
    setAdmissionForm((current) => ({
      ...current,
      gender: employee.gender || current.gender,
      dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.slice(0, 10) : current.dateOfBirth,
      phone: employee.phone || current.phone,
      email: employee.email || current.email,
    }));
  };

  const admitEmployee = async () => {
    if (!selectedEmployeeId) return;
    setMessage(null);
    await admitSubscriptionEmployee(selectedEmployeeId, admissionForm);
    setMessage("Admission abonnée créée. Le patient est orienté sans paiement immédiat et la dépense est ajoutée au relevé mensuel.");
    setAdmissionForm({ consultationKind: "CONSULTATION_GENERALE", gender: "", dateOfBirth: "", phone: "", email: "", address: "", nationality: "", priority: "normal" });
    await load(selectedCompanyId);
  };

  const generateInvoice = async () => {
    if (!selectedCompanyId) return;
    setMessage(null);
    await generateMonthlySubscriptionInvoice(selectedCompanyId, { month: Number(invoicePeriod.month), year: Number(invoicePeriod.year) });
    setMessage("Facture mensuelle générée et envoyée dans la facturation caisse.");
    await load(selectedCompanyId);
  };

  const metrics = useMemo(() => {
    const employees = companies.reduce((sum, company) => sum + (company.employees?.length || 0), 0);
    const active = companies.filter((company) => company.status === "ACTIVE").length;
    const pendingCharges = selectedCompany?.charges?.filter((charge) => charge.status === "PENDING_MONTHLY_INVOICE") || [];
    return {
      companies: companies.length,
      active,
      employees,
      pendingAmount: pendingCharges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0),
    };
  }, [companies, selectedCompany]);

  return (
    <div>
      <PageMeta title="Abonnements entreprises | D7 Clinic" description="Gestion des entreprises abonnées, employés et factures mensuelles." />
      <PageBreadcrumb pageTitle="Abonnements entreprises" />
      <AdminPageShell
        title="Abonnements entreprises"
        subtitle="Enregistrez les sociétés abonnées, leurs employés couverts, les admissions sans paiement immédiat et les factures mensuelles consolidées."
        actions={<button onClick={() => load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><RefreshCw size={16} /> Actualiser</button>}
      >
        {message && <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">{message}</div>}

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard icon={<Building2 size={18} />} label="Entreprises" value={metrics.companies} tone="blue" />
          <StatCard icon={<ShieldCheck size={18} />} label="Actives" value={metrics.active} tone="green" />
          <StatCard icon={<Users size={18} />} label="Employés" value={metrics.employees} tone="slate" />
          <StatCard icon={<FileText size={18} />} label="À facturer" value={formatMoney(metrics.pendingAmount)} tone="amber" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <div className="space-y-6">
            <Panel title="Nouvelle entreprise" subtitle="Contrat, contact et paramètres de facturation mensuelle.">
              <div className="grid gap-3">
                <Input label="Nom commercial" value={companyForm.name} onChange={(value) => setCompanyForm((current) => ({ ...current, name: value }))} />
                <Input label="Raison sociale" value={companyForm.legalName} onChange={(value) => setCompanyForm((current) => ({ ...current, legalName: value }))} />
                <Input label="N° contrat" value={companyForm.contractNumber} onChange={(value) => setCompanyForm((current) => ({ ...current, contractNumber: value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Téléphone" value={companyForm.phone} onChange={(value) => setCompanyForm((current) => ({ ...current, phone: value }))} />
                  <Input label="Email" value={companyForm.email} onChange={(value) => setCompanyForm((current) => ({ ...current, email: value }))} />
                </div>
                <Input label="Contact responsable" value={companyForm.contactName} onChange={(value) => setCompanyForm((current) => ({ ...current, contactName: value }))} />
                <Input label="Jour de facturation" type="number" value={companyForm.billingDay} onChange={(value) => setCompanyForm((current) => ({ ...current, billingDay: value }))} />
                <button onClick={saveCompany} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Enregistrer l'entreprise</button>
              </div>
            </Panel>

            <Panel title="Entreprises enregistrées">
              <div className="space-y-2">
                {companies.map((company) => (
                  <button key={company.id} onClick={() => load(company.id)} className={`w-full rounded-lg border p-3 text-left transition ${selectedCompanyId === company.id ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30" : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{company.name}</p>
                      <StatusBadge label={company.status} tone={statusTone(company.status)} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{company.contractNumber || "Contrat non renseigné"} - {company.employees?.length || 0} employé(s)</p>
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Employés de l'entreprise" subtitle="Pré-enregistrez les agents couverts avant leur première admission.">
              <div className="mb-5 grid gap-3 lg:grid-cols-4">
                <Input label="Prénom" value={employeeForm.firstName} onChange={(value) => setEmployeeForm((current) => ({ ...current, firstName: value }))} />
                <Input label="Nom" value={employeeForm.lastName} onChange={(value) => setEmployeeForm((current) => ({ ...current, lastName: value }))} />
                <Input label="Postnom" value={employeeForm.middleName} onChange={(value) => setEmployeeForm((current) => ({ ...current, middleName: value }))} />
                <Select label="Sexe" value={employeeForm.gender} onChange={(value) => setEmployeeForm((current) => ({ ...current, gender: value }))} options={[["", "À compléter"], ["M", "Masculin"], ["F", "Féminin"]]} />
                <Input label="Date de naissance" type="date" value={employeeForm.dateOfBirth} onChange={(value) => setEmployeeForm((current) => ({ ...current, dateOfBirth: value }))} />
                <Input label="Âge" type="number" value={employeeForm.age} onChange={(value) => setEmployeeForm((current) => ({ ...current, age: value }))} />
                <Input label="Profession" value={employeeForm.profession} onChange={(value) => setEmployeeForm((current) => ({ ...current, profession: value }))} />
                <Input label="N° police" value={employeeForm.policyNumber} onChange={(value) => setEmployeeForm((current) => ({ ...current, policyNumber: value }))} />
                <Input label="Matricule" value={employeeForm.employeeNumber} onChange={(value) => setEmployeeForm((current) => ({ ...current, employeeNumber: value }))} />
                <Input label="Téléphone" value={employeeForm.phone} onChange={(value) => setEmployeeForm((current) => ({ ...current, phone: value }))} />
                <Input label="Email" value={employeeForm.email} onChange={(value) => setEmployeeForm((current) => ({ ...current, email: value }))} />
                <button onClick={saveEmployee} className="self-end rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Ajouter l'employé</button>
              </div>

              <DataTable
                headers={["Employé", "Police", "Profession", "Statut", "Action"]}
                rows={(selectedCompany?.employees || []).map((employee) => [
                  `${employee.firstName} ${employee.lastName}`,
                  employee.policyNumber,
                  employee.profession || "-",
                  <StatusBadge label={employee.patientId ? "Fiche créée" : employee.status} tone={employee.patientId ? "blue" : statusTone(employee.status)} />,
                  employee.patientId ? "Déjà admis" : <button onClick={() => prepareEmployeeAdmission(employee)} className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700">Préparer admission</button>,
                ])}
              />
            </Panel>

            <Panel title="Admission d'un abonné" subtitle="Seuls les employés sans fiche patient sont admissibles. Les données déjà connues sont reprises automatiquement.">
              <div className="grid gap-3 lg:grid-cols-3">
                <Select label="Employé admissible" value={selectedEmployeeId} onChange={setSelectedEmployeeId} options={admissibleEmployees.map((employee) => [employee.id, `${employee.firstName} ${employee.lastName} - ${employee.policyNumber}`])} />
                <Select label="Type de consultation" value={admissionForm.consultationKind} onChange={(value) => setAdmissionForm((current) => ({ ...current, consultationKind: value }))} options={[["CONSULTATION_GENERALE", "Consultation générale"], ["CONSULTATION_SPECIALISTE", "Consultation spécialiste"]]} />
                <Select label="Priorité" value={admissionForm.priority} onChange={(value) => setAdmissionForm((current) => ({ ...current, priority: value }))} options={[["normal", "Normale"], ["prioritaire", "Prioritaire"], ["urgent", "Urgente"]]} />
                <Input label="Sexe" value={admissionForm.gender || selectedEmployee?.gender || ""} onChange={(value) => setAdmissionForm((current) => ({ ...current, gender: value }))} />
                <Input label="Date de naissance" type="date" value={admissionForm.dateOfBirth || selectedEmployee?.dateOfBirth?.slice(0, 10) || ""} onChange={(value) => setAdmissionForm((current) => ({ ...current, dateOfBirth: value }))} />
                <Input label="Téléphone" value={admissionForm.phone || selectedEmployee?.phone || ""} onChange={(value) => setAdmissionForm((current) => ({ ...current, phone: value }))} />
                <Input label="Email" value={admissionForm.email || selectedEmployee?.email || ""} onChange={(value) => setAdmissionForm((current) => ({ ...current, email: value }))} />
                <Input label="Adresse" value={admissionForm.address} onChange={(value) => setAdmissionForm((current) => ({ ...current, address: value }))} />
                <Input label="Nationalité" value={admissionForm.nationality} onChange={(value) => setAdmissionForm((current) => ({ ...current, nationality: value }))} />
              </div>
              <button onClick={admitEmployee} disabled={!selectedEmployeeId} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">
                Créer l'admission abonnée
              </button>
            </Panel>

            <Panel title="Dépenses et facture mensuelle" subtitle="Toutes les dépenses du mois sont consolidées dans une facture entreprise.">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input label="Mois" type="number" value={invoicePeriod.month} onChange={(value) => setInvoicePeriod((current) => ({ ...current, month: value }))} />
                <Input label="Année" type="number" value={invoicePeriod.year} onChange={(value) => setInvoicePeriod((current) => ({ ...current, year: value }))} />
                <button onClick={generateInvoice} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Générer la facture</button>
              </div>
              <DataTable
                headers={["Date", "Employé", "Service", "Montant", "Statut"]}
                rows={(selectedCompany?.charges || []).map((charge) => [
                  formatDate(charge.serviceDate),
                  charge.employee ? `${charge.employee.firstName} ${charge.employee.lastName}` : charge.patient ? `${charge.patient.firstName || ""} ${charge.patient.lastName || ""}` : "-",
                  charge.label,
                  formatMoney(charge.amount),
                  <StatusBadge label={charge.status} tone={charge.status === "INVOICED" ? "green" : "amber"} />,
                ])}
              />
            </Panel>
          </div>
        </div>
      </AdminPageShell>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
        <option value="">Sélectionner</option>
        {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}
