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
  const [departmentForm, setDepartmentForm] = useState({ name: "", code: "", type: "MEDICAL", description: "" });
  const [unitForm, setUnitForm] = useState({ name: "", departmentId: "", location: "", contactNumber: "" });

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
    await apiFetch("/administration/departments", { method: "POST", body: JSON.stringify(departmentForm) });
    setDepartmentForm({ name: "", code: "", type: "MEDICAL", description: "" });
    await reload();
  };

  const createUnit = async () => {
    if (!unitForm.name || !unitForm.departmentId) return;
    await apiFetch("/administration/service-units", { method: "POST", body: JSON.stringify(unitForm) });
    setUnitForm({ name: "", departmentId: "", location: "", contactNumber: "" });
    await reload();
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
            <input value={departmentForm.name} onChange={(event) => setDepartmentForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nom" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={departmentForm.code} onChange={(event) => setDepartmentForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <select value={departmentForm.type} onChange={(event) => setDepartmentForm((current) => ({ ...current, type: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="MEDICAL">Medical</option>
              <option value="NURSING">Soins infirmiers</option>
              <option value="SURGERY">Chirurgie</option>
              <option value="LABORATORY">Laboratoire</option>
              <option value="RADIOLOGY">Radiologie</option>
              <option value="PHARMACY">Pharmacie</option>
              <option value="RECEPTION">Reception</option>
              <option value="BILLING">Caisse</option>
              <option value="ADMINISTRATION">Administration</option>
            </select>
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
            <input value={unitForm.location} onChange={(event) => setUnitForm((current) => ({ ...current, location: event.target.value }))} placeholder="Localisation" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={unitForm.contactNumber} onChange={(event) => setUnitForm((current) => ({ ...current, contactNumber: event.target.value }))} placeholder="Contact" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createUnit} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white md:col-span-2"><Plus size={17} /> Ajouter l'unite</button>
          </div>
        </Panel>
      </div>
    </AdminPageShell>
  );
}
