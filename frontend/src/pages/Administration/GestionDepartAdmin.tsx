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

const institutionalDepartments = [
  { name: "MEDECINE GENERALE", code: "medecine_generale", type: "MEDICAL", description: "Consultations medicales generales et specialites cliniques." },
  { name: "CHIRURGIE", code: "chirurgie", type: "SURGERY", description: "Activites chirurgicales, blocs et prise en charge perioperatoire." },
  { name: "EXAMENS SPECIALISES", code: "examens_specialises", type: "MEDICAL", description: "Examens techniques specialises hors laboratoire et imagerie." },
  { name: "IMAGERIE & DIAGNOSTICS", code: "imagerie_diagnostics", type: "RADIOLOGY", description: "Radiologie, scanner, IRM, echographie et diagnostics par image." },
  { name: "LABORATOIRE", code: "laboratoire", type: "LABORATORY", description: "Analyses biomedicales, prelevements, resultats et validations." },
  { name: "PHARMACIE", code: "pharmacie", type: "PHARMACY", description: "Dispensation, stock medicamenteux et conseil pharmaceutique." },
  { name: "SANTE MENTALE", code: "sante_mentale", type: "MEDICAL", description: "Psychiatrie, psychologie clinique et accompagnement therapeutique." },
  { name: "REEDUCATION", code: "reeducation", type: "NURSING", description: "Kinesitherapie, readaptation et soins de support." },
  { name: "URGENCES", code: "urgences", type: "MEDICAL", description: "Accueil, tri, urgence medicale et soins critiques." },
  { name: "HOSPITALISATION", code: "hospitalisation", type: "NURSING", description: "Unites d'hospitalisation, chambres, lits et suivi inpatient." },
  { name: "PREVENTION & CONSULTATION", code: "prevention_consultation", type: "MEDICAL", description: "Prevention, vaccination, check-up et consultations programmes." },
  { name: "ADMINISTRATION", code: "administration", type: "ADMINISTRATION", description: "Direction, reception, caisse, secretariat et support administratif." },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function userName(employee: NonNullable<Department["Employee"]>[number]) {
  const user = employee.user;
  return user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Employe";
}

export default function GestionDepartAdmin() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [departmentForm, setDepartmentForm] = useState({ name: "", code: "", type: "MEDICAL", description: "" });

  const load = async () => {
    setIsLoading(true);
    try {
      setDepartments(await apiFetch<Department[]>("/administration/departments").catch(() => []));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    window.addEventListener("d7:administrationUpdated", load);
    return () => window.removeEventListener("d7:administrationUpdated", load);
  }, []);

  const createDepartment = async () => {
    if (!departmentForm.name || !departmentForm.code) return;
    await apiFetch("/administration/departments", { method: "POST", body: JSON.stringify(departmentForm) });
    setDepartmentForm({ name: "", code: "", type: "MEDICAL", description: "" });
    await load();
  };

  const createInstitutionalDepartments = async () => {
    const existing = new Set(departments.map((department) => normalize(department.name)));
    for (const department of institutionalDepartments) {
      if (!existing.has(normalize(department.name))) {
        await apiFetch("/administration/departments", {
          method: "POST",
          body: JSON.stringify(department),
        }).catch(() => undefined);
      }
    }
    await load();
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
      title="Departements"
      subtitle="Structure institutionnelle de la clinique. Les responsables de departement creent ensuite leurs services operationnels."
      actions={
        <button onClick={createInstitutionalDepartments} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
          Creer la structure officielle
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Building2 size={20} />} label="Departements" value={metrics.departments} />
        <StatCard icon={<Layers3 size={20} />} label="Services rattaches" value={metrics.units} tone="blue" />
        <StatCard icon={<MapPin size={20} />} label="Salles rattachees" value={metrics.rooms} tone="green" />
        <StatCard icon={<UsersRound size={20} />} label="Employes rattaches" value={metrics.staff} tone="violet" />
      </div>

      {missingInstitutionalCount > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {missingInstitutionalCount} departement(s) officiel(s) ne sont pas encore crees. Utilise le bouton de structure officielle pour aligner la clinique.
        </div>
      ) : null}

      <Panel title="Departements institutionnels" subtitle="Les services visibles ici sont ceux crees ensuite par les responsables du departement.">
        <DataTable
          headers={["Departement", "Code", "Type", "Responsables", "Services crees", "Personnel", "Statut"]}
          empty={isLoading ? "Chargement des departements..." : "Aucun departement configure."}
          rows={departments.map((department) => {
            const responsables = (department.Employee || []).filter((employee) => employee.user?.serviceResponsabilites?.length);
            return [
              <div key="name"><p className="font-semibold text-slate-900 dark:text-white">{department.name}</p><p className="text-xs text-slate-500">{department.description || "-"}</p></div>,
              department.code,
              department.type,
              responsables.map(userName).join(", ") || "-",
              department.services?.map((unit) => unit.name).join(", ") || "-",
              `${department.Employee?.length || 0} employe(s)`,
              <StatusBadge key="status" label="Operationnel" tone="green" />,
            ];
          })}
        />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel title="Ajouter un departement exceptionnel" subtitle="A utiliser seulement si la clinique ajoute un pole hors structure officielle.">
          <div className="grid gap-3">
            <input value={departmentForm.name} onChange={(event) => setDepartmentForm((current) => ({ ...current, name: event.target.value.toUpperCase() }))} placeholder="Nom du departement" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input value={departmentForm.code} onChange={(event) => setDepartmentForm((current) => ({ ...current, code: event.target.value }))} placeholder="Code unique" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <select value={departmentForm.type} onChange={(event) => setDepartmentForm((current) => ({ ...current, type: event.target.value }))} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
              <option value="MEDICAL">Medical</option>
              <option value="SURGERY">Chirurgie</option>
              <option value="RADIOLOGY">Imagerie</option>
              <option value="LABORATORY">Laboratoire</option>
              <option value="PHARMACY">Pharmacie</option>
              <option value="NURSING">Soins / hospitalisation</option>
              <option value="ADMINISTRATION">Administration</option>
            </select>
            <input value={departmentForm.description} onChange={(event) => setDepartmentForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createDepartment} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={17} /> Ajouter le departement</button>
          </div>
        </Panel>

        <Panel title="Responsabilites" subtitle="Le responsable se nomme dans Personnel. Il gere ensuite les services de son departement depuis son interface metier.">
          <div className="grid gap-3 md:grid-cols-2">
            {institutionalDepartments.map((item) => {
              const department = departments.find((entry) => normalize(entry.name) === normalize(item.name));
              const responsables = (department?.Employee || []).filter((employee) => employee.user?.serviceResponsabilites?.length);
              return (
                <div key={item.name} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                    </div>
                    {department ? <StatusBadge label="Cree" tone="green" /> : <StatusBadge label="A creer" tone="amber" />}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Responsable: {responsables.map(userName).join(", ") || "Non designe"}</p>
                  <p className="mt-1 text-xs text-slate-500">Services crees: {department?.services?.length || 0}</p>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </AdminPageShell>
  );
}
