import { useEffect, useMemo, useState } from "react";
import { Building2, Layers3, MapPin, Plus, UsersRound } from "lucide-react";
import { apiFetch } from "../../config/api";
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
};

// 1. Définition de la liste des départements officiels de la clinique
const institutionalDepartments = [
  { name: "Medecine Générale", code: "MED-GEN", type: "MEDICAL" },
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
  if (!emp?.user) return "-";
  const fullName = [emp.user.firstName, emp.user.lastName].filter(Boolean).join(" ");
  return fullName || emp.user.displayName || "-";
};

export default function GestionDepartAdmin() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [departmentForm, setDepartmentForm] = useState({ name: "", code: "", type: "MEDICAL", description: "", isParamedical: false });
  const [unitForm, setUnitForm] = useState({ name: "", departmentId: "", location: "", price: "" });

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
            const responsables = (department.Employee || []).filter((employee) => employee.user?.serviceResponsabilites?.length);
            return [
              <div key="name"><p className="font-semibold text-slate-900 dark:text-white">{department.name}</p><p className="text-xs text-slate-500">{department.description || "-"}</p></div>,
              department.code,
              department.type,
              responsables.map(userName).join(", ") || "-",
              department.services?.map((unit) => unit.name).join(", ") || "-",
              `${department.Employee?.length || 0} employé(s)`,
              <StatusBadge key="status" label="Opérationnel" tone="green" />,
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
    </AdminPageShell>
  );
}