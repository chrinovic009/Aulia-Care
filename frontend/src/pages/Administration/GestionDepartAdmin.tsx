import { useEffect, useMemo, useState } from "react";
import { Building2, Layers3, MapPin, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { apiFetch } from "../../config/api";
import { Modal } from "../../components/ui/modal";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge } from "./adminUi";

type Department = {
  id: string;
  name: string;
  code: string;
  type: string;
  description?: string | null;
  services?: Array<{ id: string; name: string; active?: boolean; rooms?: Array<{ beds?: unknown[] }> }>;
  Employee?: Array<{
    id: string;
    user?: {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      primaryRole?: string | null;
      serviceResponsabilites?: unknown[];
    } | null;
  }>;
  departmentResponsabilites?: Array<{
    id: string;
    principal?: boolean;
    actif?: boolean;
    user?: {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      primaryRole?: string | null;
    } | null;
  }>;
};

// 1. Définition de la liste des départements officiels de la clinique
const institutionalDepartments = [
  { name: "Medecine Générale", code: "MED-GEN", type: "MEDICAL" },
  { name: "Medecine Interne", code: "MED-INT", type: "MEDICAL" },
  { name: "Gynécologie Obtétrique", code: "GYN-OBS", type: "MEDICAL" },
  { name: "Infirmérie", code: "Inf", type: "MEDICAL" },
  { name: "Chirurgie Générale", code: "CHI-GEN", type: "MEDICAL" },
  { name: "Imagerie & Diagnostics", code: "IMA-DIAG", type: "TECHNICAL" },
  { name: "Laboratoire Medical", code: "LAB-MED", type: "TECHNICAL" },
  { name: "Pharmacie", code: "PHARMA", type: "PHARMACY" },
  { name: "Santé Mentale", code: "SANTE-MENT", type: "MEDICAL" },
  { name: "Rééducation & Kinesitherapie", code: "REED-KINE", type: "MEDICAL" },
  { name: "Urgences & Soins Intensifs", code: "URG-SOINS", type: "MEDICAL" },
  { name: "Unité d'Hospitalisation", code: "HOSP", type: "MEDICAL" },
  { name: "Prevention & Vaccination", code: "PREV-VAC", type: "MEDICAL" },
  { name: "Administration & Gestion", code: "ADMIN-GEST", type: "ADMINISTRATIVE" }
];

// Helper global pour normaliser les chaînes de caractères (retire les accents, espaces, etc.)
const normalize = (v: string) => 
  String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Helper global pour formater proprement le nom complet d'un employé
const userName = (emp: any) => {
  const user = emp?.user ?? emp;
  if (!user) return "-";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return fullName || user.displayName || "-";
};

export default function GestionDepartAdmin() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [departmentForm, setDepartmentForm] = useState({ name: "", code: "", type: "MEDICAL", description: "", isParamedical: false });
  const [unitForm, setUnitForm] = useState({ name: "", departmentId: "", location: "", price: "" });
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", type: "MEDICAL", description: "", isParamedical: false });

  // 2. Définition de la fonction de chargement (load)
  const load = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<Department[]>("/administration/departments");
      setDepartments(data || []);
    } catch (error) {
      console.error("Impossible de charger les départements :", error);
    } finally {
      setIsLoading(false);
    }
  };

  const reload = load; // Alias pratique pour éviter de casser les appels à reload()

  useEffect(() => {
    load();
    window.addEventListener("d7:administrationUpdated", load);
    return () => window.removeEventListener("d7:administrationUpdated", load);
  }, []);

  const createDepartment = async () => {
    if (!departmentForm.name || !departmentForm.code) return;
    try {
      await apiFetch("/administration/departments", { method: "POST", body: JSON.stringify({ ...departmentForm }) });
      setDepartmentForm({ name: "", code: "", type: "MEDICAL", description: "", isParamedical: false });
      await reload();
    } catch (error) {
      console.error("Erreur lors de la création du département :", error);
    }
  };

  // 3. Fonction pour créer automatiquement toute la structure manquante
  const createInstitutionalDepartments = async () => {
    setIsLoading(true);
    try {
      const missing = institutionalDepartments.filter((item) =>
        !departments.some((department) => normalize(department.name) === normalize(item.name))
      );

      for (const dept of missing) {
        await apiFetch("/administration/departments", {
          method: "POST",
          body: JSON.stringify({
            name: dept.name,
            code: dept.code,
            type: dept.type,
            description: `Département officiel de ${dept.name}`,
            isParamedical: false
          })
        });
      }
      await reload();
    } catch (error) {
      console.error("Erreur lors de l'initialisation de la structure :", error);
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (department: Department) => {
    setEditingDepartment(department);
    setEditForm({
      name: department.name || "",
      code: department.code || "",
      type: department.type || "MEDICAL",
      description: department.description || "",
      isParamedical: Boolean(department.services?.length ? department.services.some((unit) => unit.name?.toLowerCase().includes("paramed")) : false),
    });
  };

  const closeEditModal = () => {
    setEditingDepartment(null);
    setEditForm({ name: "", code: "", type: "MEDICAL", description: "", isParamedical: false });
  };

  const saveDepartment = async () => {
    if (!editingDepartment) return;
    await apiFetch(`/administration/departments/${editingDepartment.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editForm.name.trim(),
        code: editForm.code.trim(),
        type: editForm.type,
        description: editForm.description.trim(),
        isParamedical: editForm.isParamedical,
      }),
    });
    closeEditModal();
    await reload();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await apiFetch(`/administration/departments/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    await reload();
  };

  const createUnit = async () => {
    const name = unitForm.name?.trim() || "";
    if (!name || !unitForm.departmentId) return;

    const normalized = normalize(name);
    const isInternal = ['caisse', 'secretariat'].includes(normalized);

    if (!isInternal && (!unitForm.price || Number(unitForm.price) <= 0)) {
      window.alert('Le tarif est requis pour tous les services sauf Caisse.');
      return;
    }

    try {
      const service = await apiFetch<{ id: string }>("/services", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: `Service ${name}`,
          active: true,
        }),
      });

      await apiFetch("/administration/service-units", {
        method: "POST",
        body: JSON.stringify({
          name,
          departmentId: unitForm.departmentId,
          active: true,
        }),
      });

      if (!isInternal) {
        try {
          await apiFetch(`/services/${service.id}/prices`, {
            method: "POST",
            body: JSON.stringify({ prix: Number(unitForm.price), actif: true }),
          });
        } catch (err: any) {
          console.error('Failed to add price:', err);
          const message = err?.body?.message || err?.message || 'Erreur lors de l\'ajout du tarif';
          window.alert(`Service créé mais tarif non ajouté: ${message}`);
        }
      }

      setUnitForm({ name: "", departmentId: "", location: "", price: "" });
      await reload();
    } catch (error: any) {
      console.error(error);
      const message = error?.body?.message || error?.message || 'Erreur lors de la création du service';
      window.alert(message.includes('unique') ? 'Un service portant ce nom existe déjà.' : `Impossible de créer le service: ${message}`);
    }
  };

  const metrics = useMemo(() => ({
    departments: departments.length,
    units: departments.reduce((sum, department) => sum + (department.services?.length || 0), 0),
    rooms: departments.reduce((sum, department) => sum + (department.services || []).reduce((total, unit) => total + (unit.rooms?.length || 0), 0), 0),
    staff: departments.reduce((sum, department) => sum + (department.Employee?.length || 0), 0),
  }), [departments]);

  const missingInstitutionalCount = institutionalDepartments.filter((item) =>
    !departments.some((department) => normalize(department.name) === normalize(item.name)),
  ).length;

  return (
    <AdminPageShell
      title="Départements"
      subtitle="Structure institutionnelle de la clinique. Les responsables de département créent ensuite leurs services opérationnels."
      actions={
        <button onClick={createInstitutionalDepartments} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
          Créer la structure officielle
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Building2 size={20} />} label="Départements" value={metrics.departments} />
        <StatCard icon={<Layers3 size={20} />} label="Services rattachés" value={metrics.units} tone="blue" />
        <StatCard icon={<MapPin size={20} />} label="Salles rattachées" value={metrics.rooms} tone="green" />
        <StatCard icon={<UsersRound size={20} />} label="Employés rattachés" value={metrics.staff} tone="violet" />
      </div>

      {missingInstitutionalCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {missingInstitutionalCount} département(s) officiel(s) ne sont pas encore créés. Utilisez le bouton de structure officielle pour aligner la clinique.
        </div>
      ) : null}

      <Panel title="Départements institutionnels" subtitle="Les services visibles ici sont ceux créés ensuite par les responsables du département.">
        <DataTable
          headers={["Département", "Code", "Type", "Responsables", "Services créés", "Personnel", "Statut"]}
          empty={isLoading ? "Chargement des départements..." : "Aucun département configuré."}
          rows={departments.map((department) => {
            const responsables = (department.departmentResponsabilites || [])
              .filter((responsable) => responsable.actif !== false)
              .map((responsable) => responsable.user)
              .filter(Boolean);
            return [
              <div key="name"><p className="font-semibold text-slate-900 dark:text-white">{department.name}</p><p className="text-xs text-slate-500">{department.description || "-"}</p></div>,
              department.code,
              department.type,
              responsables.map(userName).join(", ") || "-",
              department.services?.map((unit) => unit.name).join(", ") || "-",
              `${department.Employee?.length || 0} employé(s)`,
              <StatusBadge key="status" label="Opérationnel" tone="green" />,
              <div key="actions" className="flex gap-2">
                <button onClick={() => openEditModal(department)} className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100" title="Modifier"><Pencil size={16} /></button>
                <button onClick={() => setDeleteTarget(department)} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50" title="Supprimer"><Trash2 size={16} /></button>
              </div>,
            ];
          })}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Nouveau département">
          <div className="grid gap-3 md:grid-cols-2">
            <select value={departmentForm.name} onChange={(event) => setDepartmentForm((current) => ({ ...current, name: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">-- Sélectionnez un département --</option>
              <option value="Medecine Générale">Médecine Générale</option>
              <option value="Medecine Interne">Medecine Interne</option>
              <option value="Gynécologie Obstétrique">Gynécologie Obstétrique</option>
              <option value="Infirmérie">Infirmérie</option>
              <option value="Chirurgie Générale">Chirurgie Générale</option>
              <option value="Imagerie & Diagnostics">Imagerie & Diagnostics</option>
              <option value="Laboratoire Medical">Laboratoire Médical</option>
              <option value="Pharmacie">Pharmacie</option>
              <option value="Santé Mentale">Santé Mentale</option>
              <option value="Rééducation & Kinesitherapie">Rééducation & Kinésithérapie</option>
              <option value="Urgences & Soins Intensifs">Urgences & Soins Intensifs</option>
              <option value="Unité d'Hospitalisation">Unité d'Hospitalisation</option>
              <option value="Prevention & Vaccination">Prévention & Vaccination</option>
              <option value="Administration & Gestion">Administration & Gestion</option>
            </select>
            <input value={departmentForm.code} onChange={(event) => setDepartmentForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <label className="flex items-center gap-2 px-2">
              <input type="checkbox" checked={departmentForm.isParamedical} onChange={(event) => setDepartmentForm((current) => ({ ...current, isParamedical: event.target.checked }))} className="h-4 w-4 rounded border-slate-200 text-slate-900" />
              <span className="text-sm text-slate-700">Département paramédical</span>
            </label>
            <input value={departmentForm.description} onChange={(event) => setDepartmentForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createDepartment} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white md:col-span-2"><Plus size={17} /> Ajouter le département</button>
          </div>
        </Panel>

        <Panel title="Nouvelle unité de service">
          <div className="grid gap-3 md:grid-cols-2">
            <select value={unitForm.departmentId} onChange={(event) => setUnitForm((current) => ({ ...current, departmentId: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Département</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
            <input value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom de l'unité" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={unitForm.price} onChange={(event) => setUnitForm((current) => ({ ...current, price: event.target.value }))} placeholder="Tarif" type="number" min="0" step="0.01" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createUnit} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white md:col-span-2"><Plus size={17} /> Ajouter l'unité</button>
          </div>
        </Panel>
      </div>

      <Modal isOpen={Boolean(editingDepartment)} onClose={closeEditModal} className="max-w-2xl p-0">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Modifier le département</h3>
          <p className="mt-1 text-sm text-slate-500">Modifiez les informations du département et enregistrez les changements.</p>
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
                <input value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Code</label>
                <input value={editForm.code} onChange={(event) => setEditForm((current) => ({ ...current, code: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
              <select value={editForm.type} onChange={(event) => setEditForm((current) => ({ ...current, type: event.target.value }))} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm">
                <option value="MEDICAL">MEDICAL</option>
                <option value="SURGERY">SURGERY</option>
                <option value="RADIOLOGY">RADIOLOGY</option>
                <option value="LABORATORY">LABORATORY</option>
                <option value="PHARMACY">PHARMACY</option>
                <option value="NURSING">NURSING</option>
                <option value="ADMINISTRATION">ADMINISTRATION</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <textarea value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={editForm.isParamedical} onChange={(event) => setEditForm((current) => ({ ...current, isParamedical: event.target.checked }))} /> Département paramédical</label>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={closeEditModal} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>
            <button onClick={saveDepartment} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Enregistrer</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} className="max-w-lg p-0">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Confirmer la suppression</h3>
          <p className="mt-2 text-sm text-slate-500">Voulez-vous vraiment supprimer le département <span className="font-semibold text-slate-800">{deleteTarget?.name}</span> ?</p>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setDeleteTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Non</button>
            <button onClick={confirmDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">Oui, supprimer</button>
          </div>
        </div>
      </Modal>
    </AdminPageShell>
  );
}