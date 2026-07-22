import { useEffect, useMemo, useState } from "react";
import { Activity, Pencil, Stethoscope, Trash2, UsersRound } from "lucide-react";
import { apiFetch } from "../../config/api";
import { Modal } from "../../components/ui/modal";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge, formatMoney } from "./adminUi";

type ServiceRecord = {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
  isParamedical?: boolean;
  staff?: Array<{ user?: AdminUser; roleInService?: string | null }>;
  responsables?: Array<{ user?: AdminUser; principal?: boolean }>;
  tarifs?: Array<{ prix?: string | number; dateDebut?: string; actif?: boolean }>;
};

type AdminUser = {
  id: string;
  displayName?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  primaryRole?: string;
};

const operationalOnly = new Set(["Réception", "Reception", "Caisse", "Secrétariat", "Secretariat"]);

export default function GestionServAdmin() {

  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [editingService, setEditingService] = useState<ServiceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceRecord | null>(null);
  const [form, setForm] = useState({ name: "", description: "", active: true, isParamedical: false });

  const load = async () => {
    setIsLoading(true);
    try {
      const [servicesData, usersData] = await Promise.all([
        apiFetch<ServiceRecord[]>("/services").catch(() => []),
        apiFetch<AdminUser[]>("/users").catch(() => []),
      ]);
      setServices(servicesData);
      setUsers(usersData.filter((user) => user.primaryRole !== "SUPER_ADMIN" && user.primaryRole !== "ADMIN" && user.primaryRole !== "PATIENT"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    window.addEventListener("aulia:administrationUpdated", load);
    return () => window.removeEventListener("aulia:administrationUpdated", load);
  }, []);


  const metrics = useMemo(() => ({
    total: services.length,
    active: services.filter((service) => service.active !== false).length,
    staff: services.reduce((sum, service) => sum + (service.staff?.length || 0), 0),
    responsables: services.reduce((sum, service) => sum + (service.responsables?.length || 0), 0),
  }), [services]);
  const selectedService = services.find((service) => service.id === selectedServiceId);
  const selectedServiceIsOperational = Boolean(selectedService && operationalOnly.has(selectedService.name));


  const addResponsible = async () => {
    if (!selectedServiceId || !responsibleUserId) return;
    await apiFetch(`/services/${selectedServiceId}/responsables`, { method: "POST", body: JSON.stringify({ userId: responsibleUserId, principal: true }) });
    setResponsibleUserId("");
    await load();
  };

  const addMember = async () => {
    if (!selectedServiceId || !memberUserId) return;
    const user = users.find((item) => item.id === memberUserId);
    await apiFetch(`/services/${selectedServiceId}/staff`, { method: "POST", body: JSON.stringify({ userId: memberUserId, roleInService: user?.primaryRole || "Membre" }) });
    setMemberUserId("");
    await load();
  };

  const openEditModal = (service: ServiceRecord) => {
    setEditingService(service);
    setForm({
      name: service.name || "",
      description: service.description || "",
      active: service.active !== false,
      isParamedical: Boolean(service.isParamedical),
    });
  };

  const closeEditModal = () => {
    setEditingService(null);
    setForm({ name: "", description: "", active: true, isParamedical: false });
  };

  const saveService = async () => {
    if (!editingService) return;
    await apiFetch(`/services/${editingService.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim(),
        active: form.active,
        isParamedical: form.isParamedical,
      }),
    });
    closeEditModal();
    await load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/services/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    await load();
  };

  return (
    <AdminPageShell
      title="Services"
      subtitle="Catalogue complet des services, responsables, equipes et tarifs."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Stethoscope size={20} />} label="Services" value={metrics.total} />
        <StatCard icon={<Activity size={20} />} label="Actifs" value={metrics.active} tone="green" />
        <StatCard icon={<UsersRound size={20} />} label="Personnel affecte" value={metrics.staff} tone="blue" />
        <StatCard icon={<UsersRound size={20} />} label="Responsables" value={metrics.responsables} tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel title="Services existants" subtitle="Les services Réception et Caisse sont opérationnels internes et exclus de l’admission patient.">
          <DataTable
            headers={["Service", "Responsable", "Equipe", "Tarif actif", "Statut"]}
            empty={isLoading ? "Chargement des services..." : "Aucun service enregistre."}
            rows={services.map((service) => [
              <div key="service"><p className="font-semibold text-slate-900 dark:text-white">{service.name} {service.isParamedical ? <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Paramédical</span> : null}</p><p className="text-xs text-slate-500">{service.description || "-"}</p></div>,
              service.responsables?.map((item) => userName(item.user)).filter(Boolean).join(", ") || "-",
              service.staff?.map((item) => userName(item.user)).filter(Boolean).slice(0, 3).join(", ") || `${service.staff?.length || 0} membre(s)`,
              service.tarifs?.[0]?.prix ? formatMoney(service.tarifs[0].prix) : "-",
              service.active === false ? <StatusBadge key="status" label="Inactif" tone="amber" /> : <StatusBadge key="status" label="Actif" tone="green" />,
              <div key="actions" className="flex gap-2">
                <button onClick={() => openEditModal(service)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100" title="Modifier"><Pencil size={16} /></button>
                <button onClick={() => setDeleteTarget(service)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Supprimer"><Trash2 size={16} /></button>
              </div>,
            ])}
          />
        </Panel>

        <div className="space-y-6">

          <Panel title="Tarif, responsable et equipe">
            <div className="space-y-3">
              <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                <option value="">Choisir un service</option>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
              {selectedServiceIsOperational && <p className="text-xs text-slate-500">Ce service est interne: aucun tarif patient ne peut etre cree.</p>}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select value={responsibleUserId} onChange={(event) => setResponsibleUserId(event.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                  <option value="">Responsable du service</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{userName(user)} - {user.primaryRole}</option>)}
                </select>
                <button onClick={addResponsible} className="rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white">Lier</button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                  <option value="">Membre du service</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{userName(user)} - {user.primaryRole}</option>)}
                </select>
                <button onClick={addMember} className="rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Ajouter</button>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Modal isOpen={Boolean(editingService)} onClose={closeEditModal} className="max-w-2xl p-0">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Modifier le service</h3>
          <p className="mt-1 text-sm text-slate-500">Modifiez les informations de ce service et enregistrez les changements.</p>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.isParamedical} onChange={(event) => setForm((current) => ({ ...current, isParamedical: event.target.checked }))} /> Paramédical</label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Actif</label>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={closeEditModal} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
            <button onClick={saveService} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Enregistrer</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} className="max-w-lg p-0">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Confirmer la suppression</h3>
          <p className="mt-2 text-sm text-slate-500">Voulez-vous vraiment supprimer le service <span className="font-semibold text-slate-800">{deleteTarget?.name}</span> ?</p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Non</button>
            <button onClick={confirmDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Oui, supprimer</button>
          </div>
        </div>
      </Modal>
    </AdminPageShell>
  );
}

function userName(user?: AdminUser) {
  return user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "";
}
