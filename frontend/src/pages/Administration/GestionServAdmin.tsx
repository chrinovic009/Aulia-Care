import { useEffect, useMemo, useState } from "react";
import { Activity, DollarSign, Plus, Stethoscope, UsersRound } from "lucide-react";
import { apiFetch } from "../../config/api";
import { AdminPageShell, DataTable, Panel, StatCard, StatusBadge, formatMoney } from "./adminUi";

type ServiceRecord = {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
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

const serviceCatalog = [
  "Médecine générale", "Pédiatrie", "Gynécologie & obstétrique", "Cardiologie", "Pneumologie", "Neurologie",
  "Gastro-entérologie", "Néphrologie", "Endocrinologie & diabétologie", "Dermatologie", "Rhumatologie",
  "Infectiologie", "Oncologie", "Gériatrie", "Médecine du sport",
  "Chirurgie générale", "Chirurgie orthopédique & traumatologique", "Chirurgie cardiovasculaire", "Neurochirurgie",
  "Chirurgie plastique & reconstructive", "Chirurgie ORL", "Chirurgie maxillo-faciale", "Chirurgie pédiatrique", "Chirurgie gynécologique",
  "Radiologie", "Échographie", "Mammographie", "Médecine nucléaire", "Laboratoire d’analyses médicales", "Pathologie & anatomie cytologique",
  "Pharmacie interne", "Pharmacie externe", "Gestion des stocks & traçabilité des médicaments", "Conseil pharmaceutique personnalisé",
  "Psychiatrie", "Psychologie clinique", "Thérapies cognitives et comportementales", "Addictologie", "Soutien psychologique & accompagnement familial",
  "Kinésithérapie", "Rééducation fonctionnelle", "Ergothérapie", "Orthophonie", "Nutrition & diététique", "Soins palliatifs", "Douleur & algologie",
  "Urgences médicales et chirurgicales", "Réanimation & soins intensifs", "Unités d’hospitalisation", "Bloc opératoire", "Salle de réveil",
  "Médecine préventive & vaccination", "Médecine du travail", "Consultation voyage", "Check-up complet", "Téléconsultation & suivi à distance",
  "Centre de recherche clinique", "Programmes éducatifs pour patients", "Réception", "Caisse",
];

const operationalOnly = new Set(["Réception", "Reception", "Caisse"]);

export default function GestionServAdmin() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [name, setName] = useState(serviceCatalog[0]);
  const [description, setDescription] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [price, setPrice] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
    window.addEventListener("d7:administrationUpdated", load);
    return () => window.removeEventListener("d7:administrationUpdated", load);
  }, []);

  const metrics = useMemo(() => ({
    total: services.length,
    active: services.filter((service) => service.active !== false).length,
    staff: services.reduce((sum, service) => sum + (service.staff?.length || 0), 0),
    responsables: services.reduce((sum, service) => sum + (service.responsables?.length || 0), 0),
  }), [services]);

  const createService = async () => {
    if (!name.trim()) return;
    await apiFetch("/services", { method: "POST", body: JSON.stringify({ name: name.trim(), description: description || undefined, active: true }) }).catch(() => undefined);
    setDescription("");
    await load();
  };

  const createMissingCatalog = async () => {
    const existing = new Set(services.map((service) => normalize(service.name)));
    for (const serviceName of serviceCatalog) {
      if (!existing.has(normalize(serviceName))) {
        await apiFetch("/services", {
          method: "POST",
          body: JSON.stringify({
            name: serviceName,
            description: operationalOnly.has(serviceName) ? "Service opérationnel interne" : "Service clinique proposé aux patients",
            active: true,
          }),
        }).catch(() => undefined);
      }
    }
    await load();
  };

  const addPrice = async () => {
    if (!selectedServiceId || !price) return;
    await apiFetch(`/services/${selectedServiceId}/prices`, { method: "POST", body: JSON.stringify({ prix: Number(price), actif: true }) });
    setPrice("");
    await load();
  };

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

  return (
    <AdminPageShell
      title="Services"
      subtitle="Catalogue complet des services, responsables, equipes et tarifs."
      actions={<button onClick={createMissingCatalog} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Créer le catalogue hospitalier</button>}
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
              <div key="service"><p className="font-semibold text-slate-900 dark:text-white">{service.name}</p><p className="text-xs text-slate-500">{service.description || "-"}</p></div>,
              service.responsables?.map((item) => userName(item.user)).filter(Boolean).join(", ") || "-",
              service.staff?.map((item) => userName(item.user)).filter(Boolean).slice(0, 3).join(", ") || `${service.staff?.length || 0} membre(s)`,
              service.tarifs?.[0]?.prix ? formatMoney(service.tarifs[0].prix) : "-",
              service.active === false ? <StatusBadge key="status" label="Inactif" tone="amber" /> : <StatusBadge key="status" label="Actif" tone="green" />,
            ])}
          />
        </Panel>

        <div className="space-y-6">
          <Panel title="Nouveau service">
            <div className="space-y-3">
              <select value={name} onChange={(event) => setName(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                {serviceCatalog.map((serviceName) => <option key={serviceName} value={serviceName}>{serviceName}</option>)}
              </select>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
              <button onClick={createService} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={17} /> Ajouter</button>
            </div>
          </Panel>

          <Panel title="Tarif, responsable et equipe">
            <div className="space-y-3">
              <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                <option value="">Choisir un service</option>
                {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input value={price} onChange={(event) => setPrice(event.target.value)} type="number" placeholder="Nouveau tarif" className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white" />
                <button onClick={addPrice} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200"><DollarSign size={17} /></button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select value={responsibleUserId} onChange={(event) => setResponsibleUserId(event.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                  <option value="">Responsable du service</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{userName(user)} - {user.primaryRole}</option>)}
                </select>
                <button onClick={addResponsible} className="rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white">Lier</button>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} className="h-11 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                  <option value="">Membre de l'equipe</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{userName(user)} - {user.primaryRole}</option>)}
                </select>
                <button onClick={addMember} className="rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white">Ajouter</button>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </AdminPageShell>
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function userName(user?: AdminUser) {
  return user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "";
}
