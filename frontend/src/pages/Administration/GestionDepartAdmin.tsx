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
  Employee?: unknown[];
};

export default function GestionDepartAdmin() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [departmentForm, setDepartmentForm] = useState({ name: "", code: "", type: "MEDICAL", description: "", isParamedical: false });
    const [unitForm, setUnitForm] = useState({ name: "", departmentId: "", location: "", price: "" });

  useEffect(() => {
    const load = () => apiFetch<Department[]>("/administration/departments")
      .then(setDepartments)
      .catch(() => setDepartments([]))
      .finally(() => setIsLoading(false));
    load();
    window.addEventListener("d7:administrationUpdated", load);
    return () => window.removeEventListener("d7:administrationUpdated", load);
  }, []);

  const reload = async () => {
    setDepartments(await apiFetch<Department[]>("/administration/departments").catch(() => []));
  };

  const createDepartment = async () => {
    if (!departmentForm.name || !departmentForm.code) return;
    await apiFetch("/administration/departments", { method: "POST", body: JSON.stringify({ ...departmentForm }) });
    setDepartmentForm({ name: "", code: "", type: "MEDICAL", description: "", isParamedical: false });
    await reload();
  };

  const createUnit = async () => {
    const name = unitForm.name?.trim() || "";
    if (!name || !unitForm.departmentId) return;

      const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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

      setUnitForm({ name: "", departmentId: "", location: "", price: "", isParamedical: false });
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

  return (
    <AdminPageShell title="Departements" subtitle="Organisation administrative des poles, unites et effectifs de la clinique.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Building2 size={20} />} label="Departements" value={metrics.departments} />
        <StatCard icon={<Layers3 size={20} />} label="Unites" value={metrics.units} tone="blue" />
        <StatCard icon={<MapPin size={20} />} label="Salles rattachees" value={metrics.rooms} tone="green" />
        <StatCard icon={<UsersRound size={20} />} label="Employes rattaches" value={metrics.staff} tone="violet" />
      </div>

      <Panel title="Structure des departements" subtitle="Vue basee sur Department et ServiceUnit.">
        <DataTable
          headers={["Departement", "Code", "Type", "Unites", "Personnel", "Statut"]}
          empty={isLoading ? "Chargement des departements..." : "Aucun departement configure."}
          rows={departments.map((department) => [
            <div key="name"><p className="font-semibold text-slate-900 dark:text-white">{department.name}</p><p className="text-xs text-slate-500">{department.description || "-"}</p></div>,
            department.code,
            department.type,
            department.services?.map((unit) => unit.name).join(", ") || "-",
            `${department.Employee?.length || 0} employe(s)`,
            <StatusBadge key="status" label="Operationnel" tone="green" />,
          ])}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Nouveau departement">
            <div className="grid gap-3 md:grid-cols-2">
              <select value={departmentForm.name} onChange={(event) => setDepartmentForm((current) => ({ ...current, name: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                <option value="">-- Selectionnez un departement --</option>
                <option value="Medecine Générale">Medecine Générale</option>
                <option value="Chirurgie Générale">Chirurgie Générale</option>
                <option value="Imagerie & Diagnostics">Imagerie & Diagnostics</option>
                <option value="Laboratoire Medical">Laboratoire Medical</option>
                <option value="Pharmacie">Pharmacie</option>
                <option value="Santé Mentale">Santé Mentale</option>
                <option value="Rééducation & Kinesitherapie">Rééducation & Kinesitherapie</option>
                <option value="Urgences & Soins Intensifs">Urgences & Soins Intensifs</option>
                <option value="Unité d'Hospitalisation">Unité d'Hospitalisation</option>
                <option value="Prevention & Vaccination">Prevention & Vaccination</option>
                <option value="Administration & Gestion">Administration & Gestion</option>
              </select>
              <input value={departmentForm.code} onChange={(event) => setDepartmentForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
              <label className="flex items-center gap-2 px-2">
                <input type="checkbox" checked={departmentForm.isParamedical} onChange={(event) => setDepartmentForm((current) => ({ ...current, isParamedical: event.target.checked }))} className="h-4 w-4 rounded border-slate-200 text-slate-900" />
                <span className="text-sm text-slate-700">Departement paramédical</span>
              </label>
              <input value={departmentForm.description} onChange={(event) => setDepartmentForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
              <button onClick={createDepartment} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white md:col-span-2"><Plus size={17} /> Ajouter le departement</button>
            </div>
          </Panel>

        <Panel title="Nouvelle unite de service">
          <div className="grid gap-3 md:grid-cols-2">
            <select value={unitForm.departmentId} onChange={(event) => setUnitForm((current) => ({ ...current, departmentId: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="">Departement</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
            <input value={unitForm.name} onChange={(event) => setUnitForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom de l'unite" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={unitForm.price} onChange={(event) => setUnitForm((current) => ({ ...current, price: event.target.value }))} placeholder="Tarif" type="number" min="0" step="0.01" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createUnit} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white md:col-span-2"><Plus size={17} /> Ajouter l'unite</button>
          </div>
        </Panel>
      </div>
    </AdminPageShell>
  );
}
