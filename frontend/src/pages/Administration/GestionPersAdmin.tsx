import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  Download,
  Eye,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge, formatDate, formatMoney } from "./adminUi";

type RoleSlug =
  | "ADMIN"
  | "RECEPTIONIST"
  | "CASHIER"
  | "NURSE"
  | "PHYSICIAN"
  | "PHARMACIST"
  | "LAB_TECHNICIAN"
  | "LAB_MANAGER"
  | "RADIOLOGIST"
  | "SURGEON"
  | "ANESTHESIOLOGIST"
  | "FINANCE"
  | "SUPER_ADMIN"
  | "PATIENT";

type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

type AdminUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  firstName: string;
  lastName: string;
  primaryRole?: RoleSlug;
  profilePhotoUrl?: string | null;
  phone?: string | null;
  status?: UserStatus;
  nationality?: string | null;
  addressCountry?: string | null;
  addressProvince?: string | null;
  addressCity?: string | null;
  addressNeighborhood?: string | null;
  addressStreet?: string | null;
  specialty?: string | null;
  bio?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
  generatedPassword?: string;
  Employee?: Array<{
    gender?: string | null;
    dateOfBirth?: string | null;
    employeeNumber?: string | null;
    position?: string | null;
    department?: { name: string } | null;
    serviceUnit?: { name: string } | null;
    contracts?: Array<{ salary?: string | number | null; frequency?: string | null; type?: string | null }>;
    shifts?: Array<{ startAt?: string; endAt?: string; type?: string }>;
    shiftPattern?: "MANUAL" | "THREE_DAY_THREE_NIGHT_THREE_REST" | "PERMANENT_DAY";
    rotationAnchorAt?: string | null;
    rotationDays?: number | null;
    permanentShiftEndTime?: string | null;
  }>;
  staff?: Array<{ service?: ServiceRecord; roleInService?: string | null }>;
  serviceResponsabilites?: Array<{ service?: ServiceRecord; principal?: boolean }>;
};

type ServiceRecord = {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  staff?: Array<{ user?: AdminUser; roleInService?: string | null }>;
  responsables?: Array<{ user?: AdminUser; principal?: boolean }>;
};

type DepartmentRecord = {
  id: string;
  name: string;
  code: string;
};

type HrReport = {
  attendances?: Array<{ status?: string; createdAt?: string }>;
  leaveRequests?: Array<{ status?: string; leaveType?: string; requestedAt?: string }>;
  payrolls?: Array<{ status?: string; netAmount?: string | number; createdAt?: string }>;
};

type ClinicBranding = { name?: string; brandDisplayName?: string | null };

type PhoneCountry = "CD" | "AO" | "RW" | "BI" | "ZM";

const phoneCountries: Array<{ code: PhoneCountry; label: string; dial: string; digits: number }> = [
  { code: "CD", label: "RDC", dial: "+243", digits: 9 },
  { code: "AO", label: "Angola", dial: "+244", digits: 9 },
  { code: "RW", label: "Rwanda", dial: "+250", digits: 9 },
  { code: "BI", label: "Burundi", dial: "+257", digits: 8 },
  { code: "ZM", label: "Zambie", dial: "+260", digits: 9 },
];

const emailDomains = ["gmail.com", "icloud.com", "outlook.com", "yahoo.com", "proton.me"];

function calculateAge(dateOfBirth: string) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function phoneValidation(countryCode: PhoneCountry, value: string) {
  const country = phoneCountries.find((item) => item.code === countryCode) || phoneCountries[0];
  const digits = value.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return { valid: false, message: `Saisissez les ${country.digits} chiffres après ${country.dial}.`, e164: "" };
  if (digits.length !== country.digits) return { valid: false, message: `${country.label} : ${country.digits} chiffres attendus après ${country.dial}.`, e164: "" };
  if (country.code === "CD") {
    const prefixes: Record<string, string> = { "81": "Vodacom", "82": "Vodacom", "83": "Vodacom", "84": "Orange", "85": "Orange", "89": "Orange", "90": "Africell", "91": "Africell", "97": "Airtel", "98": "Airtel", "99": "Airtel" };
    const network = prefixes[digits.slice(0, 2)];
    if (!network) return { valid: false, message: "Préfixe mobile RDC non reconnu. Vérifiez le numéro.", e164: "" };
    return { valid: true, message: `RDC · ${network} (préfixe indicatif)`, e164: `${country.dial}${digits}` };
  }
  return { valid: true, message: `${country.label} · numéro valide`, e164: `${country.dial}${digits}` };
}

const roleFilters: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "Tous" },
  { key: "PHYSICIAN", label: "Medecins" },
  { key: "NURSE", label: "Infirmiers" },
  { key: "RECEPTIONIST", label: "Receptionnistes" },
  { key: "CASHIER", label: "Caissiers" },
  { key: "PHARMACIST", label: "Pharmaciens" },
  { key: "LAB_TECHNICIAN", label: "Laborantins" },
  { key: "LAB_MANAGER", label: "Responsables labo" },
  { key: "RADIOLOGIST", label: "Radiologues" },
  { key: "SURGEON", label: "Chirurgiens" },
  { key: "ANESTHESIOLOGIST", label: "Anesthesistes" },
  { key: "FINANCE", label: "Finance" },
  { key: "ACTIVE", label: "Actifs" },
  { key: "INACTIVE", label: "Inactifs" },
  { key: "SUSPENDED", label: "Suspendus" },
];

const roleOptions = roleFilters
  .filter((item) => !["ALL", "ACTIVE", "INACTIVE", "SUSPENDED"].includes(item.key))
  .map((item) => item.key as RoleSlug);

const emptyForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  gender: "",
  dateOfBirth: "",
  phoneCountry: "CD" as PhoneCountry,
  phone: "",
  email: "",
  emailLocal: "",
  emailDomain: "gmail.com",
  addressStreet: "",
  addressCity: "",
  addressProvince: "",
  addressCountry: "",
  nationality: "Congolaise",
  username: "",
  password: "",
  primaryRole: "NURSE" as RoleSlug,
  specialty: "",
  serviceId: "",
  departmentId: "",
  isResponsible: false,
  status: "ACTIVE" as UserStatus,
  salary: "",
  salaryFrequency: "MONTHLY",
  shiftMode: "ROTATION" as "ROTATION" | "PERMANENT",
  rotationAnchorAt: "",
  rotationDays: "3",
  permanentShiftEndTime: "17:30",
};

function initialPasswordPreview(clinicName: string, role: RoleSlug, firstName: string, lastName: string, position: number) {
  const establishment = (clinicName || "Aulia Care")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, "A");
  const initials = `${firstName.charAt(0) || "X"}${lastName.charAt(0) || "X"}`.toUpperCase();
  return `${establishment}${role.charAt(0)}-${initials}${position}${new Date().getFullYear()}`;
}

export default function GestionPersAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [hrReport, setHrReport] = useState<HrReport>({});
  const [clinicName, setClinicName] = useState("Aulia Care");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [createdCredential, setCreatedCredential] = useState<{ name: string; username: string; password: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<null | {
    user: AdminUser;
    type: "SUSPEND" | "INACTIVE" | "ACTIVE" | "DELETE";
  }>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const [usersData, servicesData, departmentsData, hrData, branding] = await Promise.all([
        apiFetch<AdminUser[]>("/users").catch(() => []),
        apiFetch<ServiceRecord[]>("/services").catch(() => []),
        apiFetch<DepartmentRecord[]>("/administration/departments").catch(() => []),
        apiFetch<HrReport>("/administration/reports").catch(() => ({})),
        apiFetch<ClinicBranding>("/administration/clinic-branding").catch(() => ({ name: "Aulia Care" })),
      ]);
      setUsers(usersData.filter((user) => user.primaryRole !== "SUPER_ADMIN" && user.primaryRole !== "ADMIN"));
      setServices(servicesData);
      setDepartments(departmentsData);
      setHrReport(hrData);
      setClinicName(branding.brandDisplayName || branding.name || "Aulia Care");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("aulia:user.updated", handler);
    window.addEventListener("aulia:administrationUpdated", handler);
    window.addEventListener("aulia:notification.created", handler);
    return () => {
      window.removeEventListener("aulia:user.updated", handler);
      window.removeEventListener("aulia:administrationUpdated", handler);
      window.removeEventListener("aulia:notification.created", handler);
    };
  }, []);

  const staffUsers = useMemo(() => users.filter((user) => user.primaryRole !== "PATIENT" && user.primaryRole !== "ADMIN" && user.primaryRole !== "SUPER_ADMIN"), [users]);
  const visibleUsers = useMemo(() => {
    const search = query.trim().toLowerCase();
    return staffUsers.filter((user) => {
      const matchesFilter =
        filter === "ALL" ||
        user.primaryRole === filter ||
        user.status === filter;
      const serviceName = getServiceName(user).toLowerCase();
      const fullText = [user.displayName, user.firstName, user.lastName, user.email, user.phone, serviceName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!search || fullText.includes(search));
    });
  }, [filter, query, staffUsers]);

  const stats = useMemo(() => {
    const count = (role: RoleSlug) => staffUsers.filter((user) => user.primaryRole === role).length;
    return {
      total: staffUsers.length,
      doctors: count("PHYSICIAN") + count("SURGEON") + count("ANESTHESIOLOGIST") + count("RADIOLOGIST"),
      nurses: count("NURSE"),
      receptionists: count("RECEPTIONIST"),
      cashiers: count("CASHIER"),
      pharmacists: count("PHARMACIST"),
      admins: count("ADMIN"),
    };
  }, [staffUsers]);

  const openCreate = () => {
    const next = { ...emptyForm };
    next.password = "";
    setForm(next);
    setEditingUser(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (user: AdminUser) => {
    const employee = user.Employee?.[0];
    const contract = employee?.contracts?.[0];
    const [emailLocal = "", suppliedDomain = "gmail.com"] = (user.email || "").split("@");
    const phoneCountry = user.phone?.startsWith("+244") ? "AO" : user.phone?.startsWith("+250") ? "RW" : user.phone?.startsWith("+257") ? "BI" : user.phone?.startsWith("+260") ? "ZM" : "CD";
    const selectedCountry = phoneCountries.find((item) => item.code === phoneCountry) || phoneCountries[0];
    setEditingUser(user);
    setForm({
      ...emptyForm,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      gender: employee?.gender || "",
      dateOfBirth: employee?.dateOfBirth?.slice(0, 10) || "",
      phoneCountry,
      phone: (user.phone || "").replace(selectedCountry.dial, "").replace(/^0+/, ""),
      email: user.email || "",
      emailLocal,
      emailDomain: emailDomains.includes(suppliedDomain) ? suppliedDomain : "gmail.com",
      addressStreet: user.addressStreet || "",
      addressCity: user.addressCity || "",
      addressProvince: user.addressProvince || "",
      addressCountry: user.addressCountry || "",
      nationality: user.nationality || "",
      username: user.username || "",
      password: "",
      primaryRole: (user.primaryRole || "NURSE") as RoleSlug,
      specialty: user.specialty || employee?.position || "",
      serviceId: user.staff?.[0]?.service?.id || "",
      departmentId: departments.find((department) => department.name === employee?.department?.name)?.id || "",
      isResponsible: Boolean((user.serviceResponsabilites && user.serviceResponsabilites.length) || (user as any).departmentResponsabilites?.length),
      status: user.status || "ACTIVE",
      salary: contract?.salary ? String(contract.salary) : "",
      salaryFrequency: contract?.frequency || "MONTHLY",
      shiftMode: employee?.shiftPattern === "PERMANENT_DAY" ? "PERMANENT" : "ROTATION",
      rotationAnchorAt: employee?.rotationAnchorAt?.slice(0, 10) || "",
      rotationDays: String(employee?.rotationDays || 3),
      permanentShiftEndTime: employee?.permanentShiftEndTime || "17:30",
    });
    setShowForm(true);
    setFormError(null);
  };

  const updateForm = (patch: Partial<typeof emptyForm>) => {
    const next = { ...form, ...patch };
    // Admin assigns users to departments only. Do not auto-map services here.
    const username = buildUsername(next.firstName, next.lastName);
    if (!editingUser && (patch.firstName !== undefined || patch.lastName !== undefined)) {
      next.username = username;
      if (!next.emailLocal) next.emailLocal = username ? username.replace("_", "") : "";
    }
    next.email = next.emailLocal && next.emailDomain ? `${next.emailLocal.trim()}@${next.emailDomain}`.toLowerCase() : "";
    setForm(next);
  };

  const saveEmployee = async () => {
    setIsSaving(true);
    setFormError(null);
    try {
      const age = calculateAge(form.dateOfBirth);
      if (age !== null && age < 18) {
        setFormError("Cet employé ne peut pas être enregistré : il doit avoir au moins 18 ans.");
        return;
      }
      const validatedPhone = phoneValidation(form.phoneCountry, form.phone);
      if (form.phone.trim() && !validatedPhone.valid) {
        setFormError(validatedPhone.message);
        return;
      }
      const resolvedEmail = form.emailLocal ? `${form.emailLocal.trim()}@${form.emailDomain}`.toLowerCase() : form.email.trim().toLowerCase();
      if (!resolvedEmail) {
        setFormError("Saisissez le nom de l’adresse e-mail puis choisissez son domaine.");
        return;
      }
      const displayName = [form.firstName, form.lastName].filter(Boolean).join(" ");
      const requestedUsername = form.username || buildUsername(form.firstName, form.lastName);
      const existingUsernames = users.map((user) => user.username?.toLowerCase()).filter(Boolean);
      let username = requestedUsername.toLowerCase();
      if (!form.username) {
        let suffix = 1;
        while (existingUsernames.includes(username)) {
          username = `${requestedUsername}${suffix}`.toLowerCase();
          suffix += 1;
        }
      } else if (existingUsernames.includes(username)) {
        setFormError("Nom d'utilisateur déjà pris, choisissez-en un autre.");
        return;
      }

      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        displayName,
        username,
        email: resolvedEmail,
        password: editingUser ? form.password || undefined : undefined,
        primaryRole: form.primaryRole,
        isResponsible: form.isResponsible,
        isDepartmentResponsible: form.isResponsible,
        phone: validatedPhone.e164 || undefined,
        status: form.status,
        specialty: form.specialty || undefined,
        nationality: form.nationality || undefined,
        addressCountry: form.addressCountry || undefined,
        addressProvince: form.addressProvince || undefined,
        addressCity: form.addressCity || undefined,
        addressStreet: form.addressStreet || undefined,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        departmentId: form.departmentId || undefined,
        position: form.specialty || roleLabel({ primaryRole: form.primaryRole } as AdminUser),
        salary: form.salary ? Number(form.salary) : undefined,
        salaryFrequency: form.salaryFrequency || undefined,
        shiftPattern: form.shiftMode === "PERMANENT" ? "PERMANENT_DAY" : "THREE_DAY_THREE_NIGHT_THREE_REST",
        rotationAnchorAt: form.shiftMode === "ROTATION" ? form.rotationAnchorAt || undefined : undefined,
        rotationDays: form.shiftMode === "ROTATION" ? Number(form.rotationDays || 3) : undefined,
        permanentShiftEndTime: form.shiftMode === "PERMANENT" ? form.permanentShiftEndTime : undefined,
      };

      // If admin marked user as department responsible and the department is a lab,
      // ensure the user's primary role becomes LAB_MANAGER (not LAB_TECHNICIAN).
      try {
        const dept = departments.find((d) => d.id === (form.departmentId || payload.departmentId));
        const deptType = (dept as any)?.type || (dept as any)?.departmentType || undefined;
        const isLabDept = deptType === 'LABORATORY' || String((dept as any)?.name || '').toLowerCase().includes('laboratoire');
        if (form.isResponsible && isLabDept && form.primaryRole === 'LAB_TECHNICIAN') {
          (payload as any).primaryRole = 'LAB_MANAGER';
        }
      } catch (e) {
        // ignore lookup errors
      }

      let saved: AdminUser;
      try {
        saved = editingUser
          ? await apiFetch<AdminUser>(`/users/${editingUser.id}`, { method: "PATCH", body: JSON.stringify(payload) })
          : await apiFetch<AdminUser>("/users", { method: "POST", body: JSON.stringify(payload) });
      } catch (err: any) {
        setFormError(err?.body?.message || err?.message || 'Erreur lors de la création/modification de l\'utilisateur');
        return;
      }

      // If admin marked user as department responsible, call backend endpoint to persist it
      if (!editingUser && form.isResponsible && form.departmentId) {
        try {
          await apiFetch(`/administration/departments/${form.departmentId}/responsables`, {
            method: 'POST',
            body: JSON.stringify({ userId: saved.id, principal: true }),
          });
        } catch (err: any) {
          setFormError(err?.message || 'Erreur lors de l\'assignation du responsable de département');
          return;
        }
      }

      // Service membership and service responsables are assigned by the
      // department/service responsable later; admin only assigns department.

      setShowForm(false);
      setEditingUser(null);
      if (!editingUser && saved.generatedPassword) {
        setCreatedCredential({ name: saved.displayName || `${saved.firstName} ${saved.lastName}`, username: saved.username, password: saved.generatedPassword });
      }
      await load();
    } finally {
      setIsSaving(false);
    }
  };

  const changeStatus = async (user: AdminUser, status: UserStatus) => {
    await apiFetch(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  };

  const deleteUser = async (user: AdminUser) => {
    await apiFetch(`/users/${user.id}`, { method: "DELETE" });
    await load();
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    const { user, type } = pendingAction;
    setPendingAction(null);
    if (type === "DELETE") {
      await deleteUser(user);
      return;
    }
    await changeStatus(user, type === "ACTIVE" ? "ACTIVE" : type === "SUSPEND" ? "SUSPENDED" : "INACTIVE");
  };

  return (
    <AdminPageShell
      title="Personnel"
      subtitle="Gestion du personnel medical et administratif de la clinique."
      actions={
        <>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
            <Plus size={17} /> Ajouter un employe
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-white/[0.03] dark:text-slate-200">
            <Download size={17} /> Exporter
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <StatCard icon={<UsersRound size={20} />} label="Personnel total" value={stats.total} hint="Employes actifs et suivis" />
        <StatCard icon={<Stethoscope size={20} />} label="Medecins" value={stats.doctors} tone="blue" />
        <StatCard icon={<UserRound size={20} />} label="Infirmiers" value={stats.nurses} tone="green" />
        <StatCard icon={<UsersRound size={20} />} label="Receptionnistes" value={stats.receptionists} tone="violet" />
        <StatCard icon={<BriefcaseBusiness size={20} />} label="Caissiers" value={stats.cashiers} tone="amber" />
        <StatCard icon={<ShieldCheck size={20} />} label="Pharmaciens" value={stats.pharmacists} tone="green" />
        <StatCard icon={<Building2 size={20} />} label="Services actifs" value={services.filter((service) => service.active !== false).length} tone="slate" />
      </div>

      <Panel title="Annuaire du personnel" subtitle="Recherche, filtres rapides et actions operationnelles.">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un nom, email ou telephone"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {roleFilters.map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filter === item.key
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700 dark:border-slate-800 dark:bg-white/[0.03] dark:text-slate-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          headers={["Photo", "Nom complet", "Email", "Telephone", "Fonction", "Service", "Statut", "Derniere connexion", "Actions"]}
          empty={isLoading ? "Chargement du personnel..." : "Aucun employe ne correspond aux criteres."}
          rows={visibleUsers.map((user) => [
            <Avatar key="avatar" user={user} />,
            <div key="name">
              <p className="font-semibold text-slate-900 dark:text-white">{user.displayName || `${user.firstName} ${user.lastName}`}</p>
              <p className="text-xs text-slate-500">@{user.username}</p>
            </div>,
            <span key="email" className="inline-flex items-center gap-2"><Mail size={14} /> {user.email}</span>,
            <span key="phone" className="inline-flex items-center gap-2"><Phone size={14} /> {user.phone || "-"}</span>,
            roleLabel(user),
            getServiceName(user) || "-",
            <EmployeeStatusBadge key="status" status={user.status} />,
            formatDate(user.lastLoginAt),
            <div key="actions" className="flex flex-wrap gap-1.5">
              <button onClick={() => setSelectedUser(user)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300" title="Voir profil"><Eye size={16} /></button>
              <button onClick={() => openEdit(user)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300" title="Modifier"><Pencil size={16} /></button>
              {user.status === "SUSPENDED" || user.status === "INACTIVE" ? (
                <button onClick={() => setPendingAction({ user, type: "ACTIVE" })} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Reactiver</button>
              ) : (
                <button onClick={() => setPendingAction({ user, type: "SUSPEND" })} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Suspendre</button>
              )}
              <button onClick={() => setPendingAction({ user, type: "INACTIVE" })} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Desactiver</button>
              <button onClick={() => setPendingAction({ user, type: "DELETE" })} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">Supprimer</button>
            </div>,
          ])}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Contrats et paie" subtitle="Synthese RH issue de EmployeeContract et Payroll.">
          <DataTable
            headers={["Indicateur", "Valeur"]}
            rows={[
              ["Employes avec fiche RH", staffUsers.filter((user) => user.Employee?.length).length],
              ["Paies suivies", hrReport.payrolls?.length || 0],
              ["Paie nette cumulee", formatMoney((hrReport.payrolls || []).reduce((sum, payroll) => sum + Number(payroll.netAmount || 0), 0))],
            ]}
          />
        </Panel>

        <Panel title="Presences et horaires" subtitle="Base Attendance/Shift pour le suivi des equipes.">
          <DataTable
            headers={["Statut", "Volume"]}
            rows={[
              ["Presences enregistrees", hrReport.attendances?.length || 0],
              ["Presents", (hrReport.attendances || []).filter((item) => item.status === "PRESENT").length],
              ["Absences/retards", (hrReport.attendances || []).filter((item) => item.status && item.status !== "PRESENT").length],
            ]}
          />
        </Panel>

        <Panel title="Conges et remplacements" subtitle="Demandes RH a traiter par l'administration.">
          <DataTable
            headers={["Statut", "Volume"]}
            rows={[
              ["Demandes de conge", hrReport.leaveRequests?.length || 0],
              ["En attente", (hrReport.leaveRequests || []).filter((item) => item.status === "PENDING").length],
              ["Approuvees", (hrReport.leaveRequests || []).filter((item) => item.status === "APPROVED").length],
            ]}
          />
        </Panel>
      </div>

      <Panel title="Equipes medicales" subtitle="Responsables, membres et effectifs par service.">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <div key={service.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{service.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{service.description || "Service clinique"}</p>
                </div>
                <StatusBadge label={`${service.staff?.length || 0} membres`} tone="blue" />
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <p><span className="text-slate-500">Responsable : </span>{service.responsables?.map((item) => item.user?.displayName).filter(Boolean).join(", ") || "-"}</p>
                <p><span className="text-slate-500">Equipe : </span>{service.staff?.slice(0, 4).map((item) => item.user?.displayName).filter(Boolean).join(", ") || "-"}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {showForm ? (
        <EmployeeForm
          form={form}
          departments={departments}
          services={services}
          isSaving={isSaving}
          editing={Boolean(editingUser)}
          onChange={updateForm}
          onClose={() => setShowForm(false)}
          onSave={saveEmployee}
          error={formError}
          passwordPreview={initialPasswordPreview(clinicName, form.primaryRole, form.firstName, form.lastName, users.filter((user) => user.primaryRole === form.primaryRole).length + 1)}
        />
      ) : null}

      {selectedUser ? <ProfileDrawer user={selectedUser} onClose={() => setSelectedUser(null)} /> : null}
      {pendingAction ? (
        <ConfirmActionModal
          action={pendingAction}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
        />
      ) : null}
      {createdCredential ? <GeneratedCredentialModal credential={createdCredential} onClose={() => setCreatedCredential(null)} /> : null}
    </AdminPageShell>
  );
}

function GeneratedCredentialModal({ credential, onClose }: { credential: { name: string; username: string; password: string }; onClose: () => void }) {
  return <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto overscroll-contain bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
    <div role="dialog" aria-modal="true" className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-aulia-teal/30 bg-white p-5 shadow-2xl dark:bg-slate-950 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-aulia-teal">Accès initial</p>
      <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Compte créé pour {credential.name}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Communiquez ces identifiants une seule fois par un canal sûr. Le collaborateur doit changer son mot de passe à sa première connexion.</p>
      <dl className="mt-5 space-y-3 rounded-xl bg-aulia-mist p-4 text-sm text-aulia-navy dark:bg-slate-900 dark:text-slate-100"><div><dt className="text-xs font-semibold uppercase opacity-70">Utilisateur</dt><dd className="mt-1 font-bold">{credential.username}</dd></div><div><dt className="text-xs font-semibold uppercase opacity-70">Mot de passe temporaire</dt><dd className="mt-1 break-all font-bold">{credential.password}</dd></div></dl>
      <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl bg-aulia-navy px-4 py-3 text-sm font-semibold text-white">J’ai communiqué les identifiants</button>
    </div>
  </div>;
}

function ConfirmActionModal({
  action,
  onCancel,
  onConfirm,
}: {
  action: { user: AdminUser; type: "SUSPEND" | "INACTIVE" | "ACTIVE" | "DELETE" };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const name = action.user.displayName || `${action.user.firstName} ${action.user.lastName}`.trim() || action.user.username;
  const copy = {
    SUSPEND: {
      title: "Suspendre ce compte ?",
      text: `${name} ne pourra plus accéder à son interface tant que son compte ne sera pas réactivé.`,
      button: "Confirmer la suspension",
      tone: "bg-red-600 hover:bg-red-700",
    },
    INACTIVE: {
      title: "Désactiver ce compte ?",
      text: `${name} sera bloqué à la connexion et devra contacter l’administrateur pour réactivation.`,
      button: "Confirmer la désactivation",
      tone: "bg-amber-600 hover:bg-amber-700",
    },
    ACTIVE: {
      title: "Réactiver ce compte ?",
      text: `${name} pourra de nouveau se connecter à son interface.`,
      button: "Réactiver",
      tone: "bg-emerald-600 hover:bg-emerald-700",
    },
    DELETE: {
      title: "Supprimer cet employé ?",
      text: `Cette action supprimera le compte de ${name}. Utilise plutôt désactiver si tu veux garder l’historique.`,
      button: "Supprimer définitivement",
      tone: "bg-slate-900 hover:bg-slate-800",
    },
  }[action.type];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{copy.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.text}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
            Annuler
          </button>
          <button onClick={onConfirm} className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition ${copy.tone}`}>
            {copy.button}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeeForm({
  form,
  services,
  departments,
  isSaving,
  editing,
  onChange,
  onClose,
  onSave,
  error,
  passwordPreview,
}: {
  form: typeof emptyForm;
  services: ServiceRecord[];
  departments: DepartmentRecord[];
  isSaving: boolean;
  editing: boolean;
  onChange: (patch: Partial<typeof emptyForm>) => void;
  onClose: () => void;
  onSave: () => void;
  error?: string | null;
  passwordPreview: string;
}) {
  // Admin assigns employees to departments only; services are managed later by responsables.

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto overscroll-contain bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <div role="dialog" aria-modal="true" className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:max-h-[calc(100dvh-3rem)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? "Modifier un employe" : "Ajouter un employe"}</h2>
            <p className="text-sm text-slate-500">Informations personnelles, professionnelles et affectation.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">Fermer</button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:grid-cols-2">
          <FormSection title="Informations personnelles">
            <FormInput label="Nom" value={form.lastName} onChange={(lastName) => onChange({ lastName })} />
            <FormInput label="Postnom" value={form.middleName} onChange={(middleName) => onChange({ middleName })} />
            <FormInput label="Prenom" value={form.firstName} onChange={(firstName) => onChange({ firstName })} />
            <FormSelect label="Sexe" value={form.gender} onChange={(gender) => onChange({ gender })} options={[["", "Non precise"], ["F", "Feminin"], ["M", "Masculin"]]} />
            <div><FormInput label="Date de naissance" type="date" value={form.dateOfBirth} onChange={(dateOfBirth) => onChange({ dateOfBirth })} />{calculateAge(form.dateOfBirth) !== null ? <p className={`mt-1 text-xs font-medium ${calculateAge(form.dateOfBirth)! >= 18 ? "text-aulia-teal" : "text-red-600"}`}>{calculateAge(form.dateOfBirth)! >= 18 ? `Âge : ${calculateAge(form.dateOfBirth)} ans` : `Âge : ${calculateAge(form.dateOfBirth)} ans — minimum requis : 18 ans.`}</p> : null}</div>
            <PhoneField country={form.phoneCountry} value={form.phone} onCountryChange={(phoneCountry) => onChange({ phoneCountry })} onChange={(phone) => onChange({ phone })} />
            <EmailField local={form.emailLocal} domain={form.emailDomain} onLocalChange={(emailLocal) => onChange({ emailLocal })} onDomainChange={(emailDomain) => onChange({ emailDomain })} />
            <FormInput label="Adresse" value={form.addressStreet} onChange={(addressStreet) => onChange({ addressStreet })} />
            <FormInput label="Nationalite" value={form.nationality} onChange={(nationality) => onChange({ nationality })} />
          </FormSection>

          <FormSection title="Informations professionnelles">
            <FormInput label="Nom utilisateur" value={form.username} onChange={(username) => onChange({ username })} />
            {editing ? <FormInput label="Nouveau mot de passe (laisser vide pour ne pas le changer)" value={form.password} onChange={(password) => onChange({ password })} /> : <div className="rounded-xl border border-aulia-teal/30 bg-aulia-mist p-4 text-sm text-aulia-navy dark:bg-slate-900 dark:text-slate-100"><p className="font-semibold">Mot de passe initial généré par le système</p><p className="mt-1 text-xs">L’aperçu se met à jour avec le nom, le prénom et le rôle. Le serveur reste la source de vérité au moment de créer le compte.</p><output className="mt-3 block break-all rounded-lg bg-white/80 px-3 py-2 font-mono text-base font-bold text-aulia-navy dark:bg-slate-950">{passwordPreview}</output></div>}
            <FormSelect label="Role" value={form.primaryRole} onChange={(primaryRole) => onChange({ primaryRole: primaryRole as RoleSlug })} options={roleOptions.map((role) => [role, roleLabel({ primaryRole: role } as AdminUser)])} />
            <FormInput label="Fonction / Specialite" value={form.specialty} onChange={(specialty) => onChange({ specialty })} />
            <FormSelect label="Departement RH" value={form.departmentId} onChange={(departmentId) => onChange({ departmentId })} options={[["", "Aucun"], ...departments.map((department) => [department.id, department.name] as [string, string])]} />
            <FormSelect label="Responsable du departement" value={form.isResponsible ? "YES" : "NO"} onChange={(value) => onChange({ isResponsible: value === "YES" })} options={[["NO", "Non"], ["YES", "Oui"]]} />
            <FormSelect label="Statut" value={form.status} onChange={(status) => onChange({ status: status as UserStatus })} options={[["ACTIVE", "Actif"], ["INACTIVE", "Inactif"], ["SUSPENDED", "Suspendu"]]} />
            <FormInput label="Salaire mensuel (CDF)" type="number" min="0" value={form.salary} onChange={(salary) => onChange({ salary })} />
            <FormSelect label="Frequence paie" value={form.salaryFrequency} onChange={(salaryFrequency) => onChange({ salaryFrequency })} options={[["MONTHLY", "Mensuel"], ["WEEKLY", "Hebdomadaire"], ["DAILY", "Journalier"]]} />
            <FormSelect label="Type de shift" value={form.shiftMode} onChange={(shiftMode) => onChange({ shiftMode: shiftMode as typeof form.shiftMode })} options={[["ROTATION", "Rotation"], ["PERMANENT", "Permanence"]]} />
            {form.shiftMode === "ROTATION" ? <><FormInput label="Premier jour de jour" type="date" value={form.rotationAnchorAt} onChange={(rotationAnchorAt) => onChange({ rotationAnchorAt })} /><FormInput label="Nombre de jours par phase" type="number" min="1" max="31" value={form.rotationDays} onChange={(rotationDays) => onChange({ rotationDays })} /><ShiftPreview anchor={form.rotationAnchorAt} days={Number(form.rotationDays || 0)} /></> : <><FormInput label="Heure de sortie" type="time" min="07:31" value={form.permanentShiftEndTime} onChange={(permanentShiftEndTime) => onChange({ permanentShiftEndTime })} /><div className="rounded-xl border border-aulia-teal/25 bg-aulia-mist p-3 text-xs leading-5 text-aulia-navy dark:bg-slate-900 dark:text-slate-100">Entrée fixe : 07:30, tous les jours. Choisissez uniquement l’heure de sortie.</div></>}
          </FormSection>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-end sm:p-5">
          {error ? <div className="mr-auto text-sm text-red-600">{error}</div> : null}
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">Annuler</button>
          <button disabled={isSaving || !form.firstName || !form.lastName || !form.primaryRole || (calculateAge(form.dateOfBirth) !== null && calculateAge(form.dateOfBirth)! < 18) || (form.shiftMode === "ROTATION" && (!form.rotationAnchorAt || Number(form.rotationDays) < 1))} onClick={onSave} className="rounded-lg bg-aulia-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-aulia-teal/90 disabled:cursor-not-allowed disabled:opacity-60">
            {isSaving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhoneField({ country, value, onCountryChange, onChange }: { country: PhoneCountry; value: string; onCountryChange: (value: PhoneCountry) => void; onChange: (value: string) => void }) {
  const validation = phoneValidation(country, value);
  const selected = phoneCountries.find((item) => item.code === country) || phoneCountries[0];
  return <label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Téléphone professionnel</span><div className="flex gap-2"><select value={country} onChange={(event) => onCountryChange(event.target.value as PhoneCountry)} className="h-10 w-32 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-aulia-teal dark:border-slate-800 dark:bg-slate-950 dark:text-white">{phoneCountries.map((item) => <option key={item.code} value={item.code}>{item.label} {item.dial}</option>)}</select><div className="relative flex-1"><span className="absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">{selected.dial}</span><input inputMode="tel" autoComplete="tel" value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, selected.digits))} placeholder={`${selected.digits} chiffres`} className={`h-10 w-full rounded-lg border bg-white pl-14 pr-3 text-sm outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${!value ? "border-slate-200 dark:border-slate-800" : validation.valid ? "border-aulia-teal focus:border-aulia-teal focus:ring-aulia-teal/15" : "border-red-400 focus:border-red-500 focus:ring-red-100"}`} /></div></div><p className={`mt-1 text-xs ${!value ? "text-slate-500" : validation.valid ? "font-medium text-aulia-teal" : "text-red-600"}`}>{validation.message}</p></label>;
}

function EmailField({ local, domain, onLocalChange, onDomainChange }: { local: string; domain: string; onLocalChange: (value: string) => void; onDomainChange: (value: string) => void }) {
  return <label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">E-mail professionnel</span><div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-aulia-teal focus-within:ring-2 focus-within:ring-aulia-teal/15 dark:border-slate-800 dark:bg-slate-950"><input value={local} onChange={(event) => onLocalChange(event.target.value.replace(/@.*/, "").replace(/\s/g, ""))} placeholder="nom.prenom" autoComplete="email" className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none dark:text-white" /><span className="flex h-10 items-center text-sm text-slate-500">@</span><select value={domain} onChange={(event) => onDomainChange(event.target.value)} className="h-10 max-w-32 border-l border-slate-200 bg-transparent px-2 text-sm outline-none dark:border-slate-800 dark:text-white">{emailDomains.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><p className="mt-1 text-xs text-slate-500">Adresse enregistrée : {local ? `${local}@${domain}` : "à compléter"}</p></label>;
}

function ShiftPreview({ anchor, days }: { anchor: string; days: number }) {
  if (!anchor || !Number.isInteger(days) || days < 1) return <div className="sm:col-span-2 rounded-xl border border-aulia-teal/25 bg-aulia-mist p-3 text-xs leading-5 text-aulia-navy dark:bg-slate-900 dark:text-slate-100">Jour : 07:30–17:30, puis le même nombre de nuits : 17:30–07:30, puis repos. Le cycle recommence automatiquement.</div>;
  const start = new Date(`${anchor}T00:00:00`);
  const labels = Array.from({ length: Math.min(days * 3, 9) }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const phase = index < days ? ["Jour", "07:30–17:30", "bg-aulia-teal/10 text-aulia-teal"] : index < days * 2 ? ["Nuit", "17:30–07:30", "bg-aulia-navy/10 text-aulia-navy dark:text-slate-100"] : ["Repos", "Aucune garde", "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"];
    return <div key={index} className={`rounded-lg px-2 py-2 text-xs ${phase[2]}`}><strong className="block">{date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · {phase[0]}</strong><span>{phase[1]}</span></div>;
  });
  return <div className="sm:col-span-2 rounded-xl border border-aulia-teal/25 bg-aulia-mist p-3"><p className="text-xs font-semibold text-aulia-navy dark:text-white">Aperçu du cycle automatique</p><div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">{labels}</div></div>;
}

function ProfileDrawer({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const employee = user.Employee?.[0];
  const contract = employee?.contracts?.[0];
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto overscroll-contain bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <section role="dialog" aria-modal="true" className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:max-h-[calc(100dvh-3rem)] sm:p-6">
        <div className="sticky -top-4 z-10 -mx-4 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950 sm:-top-6 sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-3">
            <Avatar user={user} large />
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{user.displayName}</h2>
              <p className="text-sm text-slate-500">{roleLabel(user)} - {getServiceName(user) || "Aucun service"}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">Fermer</button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Info label="Telephone" value={user.phone || "-"} />
          <Info label="Email" value={user.email} />
          <Info label="Adresse" value={[user.addressStreet, user.addressCity, user.addressProvince].filter(Boolean).join(", ") || "-"} />
          <Info label="Nationalite" value={user.nationality || "-"} />
          <Info label="Date de creation" value={formatDate(user.createdAt)} />
          <Info label="Derniere connexion" value={formatDate(user.lastLoginAt)} />
          <Info label="Statut" value={<EmployeeStatusBadge status={user.status} />} />
          <Info label="Salaire" value={contract?.salary ? formatMoney(contract.salary) : "-"} />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">Historique d'activite</h3>
          <p className="mt-2 text-sm text-slate-500">Compte cree le {formatDate(user.createdAt)}. Derniere connexion : {formatDate(user.lastLoginAt)}.</p>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">Permissions</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label={roleLabel(user)} tone="blue" />
            {user.serviceResponsabilites?.length ? <StatusBadge label="Responsable de service" tone="green" /> : null}
            {user.staff?.length ? <StatusBadge label="Membre d'equipe" tone="slate" /> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-4 font-semibold text-slate-900 dark:text-white">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FormInput({ label, value, onChange, type = "text", min, max }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; max?: string }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input type={type} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-aulia-teal focus:ring-2 focus:ring-aulia-teal/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
    </label>
  );
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-aulia-teal focus:ring-2 focus:ring-aulia-teal/15 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
        {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

function Avatar({ user, large = false }: { user: AdminUser; large?: boolean }) {
  const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "Aulia Care";
  const size = large ? "h-14 w-14 text-base" : "h-10 w-10 text-sm";
  if (user.profilePhotoUrl) {
    return <img src={user.profilePhotoUrl} alt={user.displayName} className={`${size} rounded-full object-cover`} />;
  }
  return <div className={`${size} flex items-center justify-center rounded-full bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200`}>{initials}</div>;
}

function EmployeeStatusBadge({ status }: { status?: UserStatus }) {
  if (status === "ACTIVE") return <StatusBadge label="Actif" tone="green" />;
  if (status === "SUSPENDED") return <StatusBadge label="Suspendu" tone="red" />;
  return <StatusBadge label="Inactif" tone="amber" />;
}

function roleLabel(user: AdminUser) {
  const gender = user.Employee?.[0]?.gender;
  switch (user.primaryRole) {
    case "ADMIN":
      return gender === "F" ? "Administratrice" : "Administrateur";
    case "RECEPTIONIST":
      return "Receptionniste";
    case "CASHIER":
      return gender === "F" ? "Caissiere" : "Caissier";
    case "NURSE":
      return gender === "F" ? "Infirmiere" : "Infirmier";
    case "PHYSICIAN":
      return "Medecin";
    case "PHARMACIST":
      return gender === "F" ? "Pharmacienne" : "Pharmacien";
    case "LAB_TECHNICIAN":
      return "Laborantin";
    case "LAB_MANAGER":
      return "Responsable laboratoire";
    case "RADIOLOGIST":
      return "Radiologue";
    case "SURGEON":
      return gender === "F" ? "Chirurgienne" : "Chirurgien";
    case "ANESTHESIOLOGIST":
      return "Anesthesiste";
    default:
      return user.primaryRole || "-";
  }
}

function getServiceName(user: AdminUser) {
  return user.staff?.[0]?.service?.name || user.serviceResponsabilites?.[0]?.service?.name || "";
}

function buildUsername(firstName: string, lastName: string) {
  return [firstName, lastName]
    .filter(Boolean)
    .join("_")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
