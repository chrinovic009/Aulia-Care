import { useEffect, useMemo, useState } from "react";
import { DollarSign, Plus, RefreshCw } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge, formatMoney } from "../Administration/adminUi";

type Department = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
  department?: Department | null;
  tarifs?: Array<{ prix?: string | number; actif?: boolean; dateDebut?: string }>;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const isCashier = (value: string) => normalize(value).includes("caisse") || normalize(value).includes("cashier");

export default function CreateReceptionService() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState({ name: "Consultation generale - Reception", description: "Frais de reception pour consultation generale", price: "" });
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [departmentData, serviceData] = await Promise.all([
      apiFetch<Department[]>("/administration/departments").catch(() => []),
      apiFetch<Service[]>("/services").catch(() => []),
    ]);
    setDepartments(departmentData);
    setServices(serviceData.filter((service) => normalize(service.department?.name || "").includes("administration") || ["reception", "caisse", "secretariat"].some((key) => normalize(service.name).includes(key))));
  };

  useEffect(() => {
    load();
  }, []);

  const administrationDepartment = departments.find((department) => 
    normalize(department.name).includes("administration")
  );
  const selectedIsCashier = isCashier(form.name);

  const metrics = useMemo(() => ({
    total: services.length,
    priced: services.filter((service) => service.tarifs?.[0]?.prix).length,
    internal: services.filter((service) => isCashier(service.name)).length,
  }), [services]);

  const createService = async () => {
    setMessage(null);
    if (!form.name.trim()) {
      setMessage("Le nom du service est requis.");
      return;
    }
    if (!administrationDepartment?.id) {
      setMessage("Le departement ADMINISTRATION doit d'abord etre cree par l'administrateur.");
      return;
    }
    if (!selectedIsCashier && Number(form.price || 0) <= 0) {
      setMessage("Le prix CDF est requis pour un service de reception facturable.");
      return;
    }

    const created = await apiFetch<Service>("/services", {
      method: "POST",
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description || undefined,
        active: true,
        isParamedical: false,
        departmentId: administrationDepartment.id,
      }),
    });

    if (!selectedIsCashier) {
      await apiFetch(`/services/${created.id}/prices`, {
        method: "POST",
        body: JSON.stringify({ prix: Number(form.price), actif: true }),
      });
    }

    setForm({ name: "Consultation generale - Reception", description: "Frais de reception pour consultation generale", price: "" });
    setMessage(selectedIsCashier ? "Service caisse cree sans tarif." : "Service reception cree avec tarif CDF.");
    await load();
  };

  return (
    <AdminPageShell
      title="Services reception"
      subtitle="Creation des services administratifs facturables. La caisse valide les factures mais ne porte pas de tarif."
      actions={<button onClick={load} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={16} /> Actualiser</button>}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard icon={<Plus size={20} />} label="Services admin" value={metrics.total} tone="blue" />
        <StatCard icon={<DollarSign size={20} />} label="Facturables" value={metrics.priced} tone="green" />
        <StatCard icon={<DollarSign size={20} />} label="Sans tarif caisse" value={metrics.internal} tone="amber" />
      </div>

      {message ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel title="Nouveau service administratif">
          <div className="grid gap-3">
            <select
              value={form.name}
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({
                  ...current,
                  name,
                  description: name.includes("specialiste")
                    ? "Frais de reception pour consultation specialiste"
                    : name.includes("generale")
                      ? "Frais de reception pour consultation generale"
                      : current.description,
                }));
              }}
              className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            >
              <option value="Consultation generale - Reception">Consultation generale - Reception</option>
              <option value="Consultation specialiste - Reception">Consultation specialiste - Reception</option>
              <option value="Caisse">Caisse</option>
            </select>
            <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <input disabled={selectedIsCashier} value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} type="number" placeholder={selectedIsCashier ? "La caisse n'a pas de tarif" : "Prix CDF"} className="h-11 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
            <button onClick={createService} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Creer le service</button>
          </div>
        </Panel>

        <Panel title="Services administratifs existants">
          <DataTable
            headers={["Service", "Departement", "Tarif actif", "Statut"]}
            empty="Aucun service administratif."
            rows={services.map((service) => [
              <div key="name"><p className="font-semibold text-slate-900 dark:text-white">{service.name}</p><p className="text-xs text-slate-500">{service.description || "-"}</p></div>,
              service.department?.name || "ADMINISTRATION",
              service.tarifs?.[0]?.prix ? formatMoney(service.tarifs[0].prix) : isCashier(service.name) ? "Sans tarif" : "-",
              service.active === false ? <StatusBadge key="status" label="Inactif" tone="amber" /> : <StatusBadge key="status" label="Actif" tone="green" />,
            ])}
          />
        </Panel>
      </div>
    </AdminPageShell>
  );
}
