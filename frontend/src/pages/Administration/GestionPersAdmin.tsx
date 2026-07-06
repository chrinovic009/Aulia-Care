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
  | "RADIOLOGIST"
  | "SURGEON"
  | "ANESTHESIOLOGIST"
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
  Employee?: Array<{
    gender?: string | null;
    dateOfBirth?: string | null;
    employeeNumber?: string | null;
    position?: string | null;
    department?: { name: string } | null;
    serviceUnit?: { name: string } | null;
    contracts?: Array<{ salary?: string | number | null; frequency?: string | null; type?: string | null }>;
    shifts?: Array<{ startAt?: string; endAt?: string; type?: string }>;
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

const roleFilters: Array<{ key: string; label: string }> = [
  { key: "ALL", label: "Tous" },
  { key: "PHYSICIAN", label: "Medecins" },
  { key: "NURSE", label: "Infirmiers" },
  { key: "RECEPTIONIST", label: "Receptionnistes" },
  { key: "CASHIER", label: "Caissiers" },
  { key: "PHARMACIST", label: "Pharmaciens" },
  { key: "LAB_TECHNICIAN", label: "Laborantins" },
  { key: "RADIOLOGIST", label: "Radiologues" },
  { key: "SURGEON", label: "Chirurgiens" },
  { key: "ANESTHESIOLOGIST", label: "Anesthesistes" },
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
  phone: "",
  email: "",
  addressStreet: "",
  addressCity: "",
  addressProvince: "",
  addressCountry: "",
  nationality: "",
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
  shiftStartAt: "",
  shiftEndAt: "",
  shiftType: "DAY",
};

export default function GestionPersAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [hrReport, setHrReport] = useState<HrReport>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pendingAction, setPendingAction] = useState<null | {
    user: AdminUser;
    type: "SUSPEND" | "INACTIVE" | "ACTIVE" | "DELETE";
  }>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const [usersData, servicesData, departmentsData, hrData] = await Promise.all([
        apiFetch<AdminUser[]>("/users").catch(() => []),
        apiFetch<ServiceRecord[]>("/services").catch(() => []),
        apiFetch<DepartmentRecord[]>("/administration/departments").catch(() => []),
        apiFetch<HrReport>("/administration/reports").catch(() => ({})),
      ]);
      setUsers(usersData.filter((user) => user.primaryRole !== "SUPER_ADMIN" && user.primaryRole !== "ADMIN"));
      setServices(servicesData);
      setDepartments(departmentsData);
      setHrReport(hrData);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("d7:user.updated", handler);
    window.addEventListener("d7:administrationUpdated", handler);
    window.addEventListener("d7:notification.created", handler);
    return () => {
      window.removeEventListener("d7:user.updated", handler);
      window.removeEventListener("d7:administrationUpdated", handler);
      window.removeEventListener("d7:notification.created", handler);
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
    next.password = generatePassword(next.primaryRole, next.firstName, next.lastName, staffUsers.length + 1);
    setForm(next);
    setEditingUser(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (user: AdminUser) => {
    const employee = user.Employee?.[0];
    const contract = employee?.contracts?.[0];
    setEditingUser(user);
    setForm({
      ...emptyForm,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      gender: employee?.gender || "",
      dateOfBirth: employee?.dateOfBirth?.slice(0, 10) || "",
      phone: user.phone || "",
      email: user.email || "",
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
      shiftStartAt: employee?.shifts?.[0]?.startAt?.slice(0, 16) || "",
      shiftEndAt: employee?.shifts?.[0]?.endAt?.slice(0, 16) || "",
      shiftType: employee?.shifts?.[0]?.type || "DAY",
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
      if (!next.email) next.email = username ? `${username.replace("_", "")}@gmail.com` : "";
    }
    if (!editingUser && (patch.firstName !== undefined || patch.lastName !== undefined || patch.primaryRole !== undefined)) {
      next.password = generatePassword(next.primaryRole, next.firstName, next.lastName, staffUsers.length + 1);
    }
    setForm(next);
  };

  const saveEmployee = async () => {
    setIsSaving(true);
    setFormError(null);
    try {
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
        email: form.email || `${form.firstName}${form.lastName}@gmail.com`.toLowerCase(),
        password: form.password || undefined,
        primaryRole: form.primaryRole,
        phone: form.phone || undefined,
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
        shiftStartAt: form.shiftStartAt || undefined,
        shiftEndAt: form.shiftEndAt || undefined,
        shiftType: form.shiftType || undefined,
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
    </AdminPageShell>
  );
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
}) {
  // Admin assigns employees to departments only; services are managed later by responsables.

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editing ? "Modifier un employe" : "Ajouter un employe"}</h2>
            <p className="text-sm text-slate-500">Informations personnelles, professionnelles et affectation.</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">Fermer</button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <FormSection title="Informations personnelles">
            <FormInput label="Nom" value={form.lastName} onChange={(lastName) => onChange({ lastName })} />
            <FormInput label="Postnom" value={form.middleName} onChange={(middleName) => onChange({ middleName })} />
            <FormInput label="Prenom" value={form.firstName} onChange={(firstName) => onChange({ firstName })} />
            <FormSelect label="Sexe" value={form.gender} onChange={(gender) => onChange({ gender })} options={[["", "Non precise"], ["F", "Feminin"], ["M", "Masculin"]]} />
            <FormInput label="Date de naissance" type="date" value={form.dateOfBirth} onChange={(dateOfBirth) => onChange({ dateOfBirth })} />
            <FormInput label="Telephone" value={form.phone} onChange={(phone) => onChange({ phone })} />
            <FormInput label="Email" value={form.email} onChange={(email) => onChange({ email })} />
            <FormInput label="Adresse" value={form.addressStreet} onChange={(addressStreet) => onChange({ addressStreet })} />
            <FormInput label="Nationalite" value={form.nationality} onChange={(nationality) => onChange({ nationality })} />
          </FormSection>

          <FormSection title="Informations professionnelles">
            <FormInput label="Nom utilisateur" value={form.username} onChange={(username) => onChange({ username })} />
            <FormInput label="Mot de passe" value={form.password} onChange={(password) => onChange({ password })} />
            <FormSelect label="Role" value={form.primaryRole} onChange={(primaryRole) => onChange({ primaryRole: primaryRole as RoleSlug })} options={roleOptions.map((role) => [role, roleLabel({ primaryRole: role } as AdminUser)])} />
            <FormInput label="Fonction / Specialite" value={form.specialty} onChange={(specialty) => onChange({ specialty })} />
            <FormSelect label="Departement RH" value={form.departmentId} onChange={(departmentId) => onChange({ departmentId })} options={[["", "Aucun"], ...departments.map((department) => [department.id, department.name] as [string, string])]} />
            <FormSelect label="Responsable du departement" value={form.isResponsible ? "YES" : "NO"} onChange={(value) => onChange({ isResponsible: value === "YES" })} options={[["NO", "Non"], ["YES", "Oui"]]} />
            <FormSelect label="Statut" value={form.status} onChange={(status) => onChange({ status: status as UserStatus })} options={[["ACTIVE", "Actif"], ["INACTIVE", "Inactif"], ["SUSPENDED", "Suspendu"]]} />
            <FormInput label="Salaire" type="number" value={form.salary} onChange={(salary) => onChange({ salary })} />
            <FormSelect label="Frequence paie" value={form.salaryFrequency} onChange={(salaryFrequency) => onChange({ salaryFrequency })} options={[["MONTHLY", "Mensuel"], ["WEEKLY", "Hebdomadaire"], ["DAILY", "Journalier"]]} />
            <FormInput label="Debut shift" type="datetime-local" value={form.shiftStartAt} onChange={(shiftStartAt) => onChange({ shiftStartAt })} />
            <FormInput label="Fin shift" type="datetime-local" value={form.shiftEndAt} onChange={(shiftEndAt) => onChange({ shiftEndAt })} />
            <FormSelect label="Type de shift" value={form.shiftType} onChange={(shiftType) => onChange({ shiftType })} options={[["DAY", "Jour"], ["NIGHT", "Nuit"], ["ROTATING", "Rotation"]]} />
          </FormSection>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-5 dark:border-slate-800">
          {error ? <div className="mr-auto text-sm text-red-600">{error}</div> : null}
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">Annuler</button>
          <button disabled={isSaving || !form.firstName || !form.lastName || !form.primaryRole} onClick={onSave} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            {isSaving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileDrawer({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const employee = user.Employee?.[0];
  const contract = employee?.contracts?.[0];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm">
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4">
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
      </aside>
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

function FormInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
    </label>
  );
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
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
  const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "D7";
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

function generatePassword(role: RoleSlug, firstName: string, lastName: string, position: number) {
  const clinicName = String(import.meta.env.VITE_CLINIC_NAME || "D7 Clinic")
    .replace(/clinique|clinic/gi, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase() || "D7";
  const year = new Date().getFullYear();
  const roleLetter = role?.[0] || "U";
  const initials = `${firstName?.[0] || "X"}${lastName?.[0] || "X"}`.toUpperCase();
  return `${clinicName}${roleLetter}-${initials}${position}${year}`.toUpperCase();
}
