import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BrainCircuit, Building2, CheckCircle2, CircleAlert, Cpu, HeartPulse, KeyRound, LoaderCircle, Plus, RadioTower, ShieldCheck, X } from "lucide-react";
import { apiFetch } from "../../config/api";
import { type AuliaLayer, usePlatformLayers } from "../../context/PlatformLayersContext";

type EstablishmentType = "HOSPITAL" | "CLINIC" | "POLYCLINIC" | "MEDICAL_CENTER" | "DIAGNOSTIC_CENTER" | "HEALTH_CENTER" | "OTHER";
type ProvisioningStatus = "DRAFT" | "IDENTITY_CONFIGURED" | "LAYERS_CONFIGURED" | "SUPER_ADMIN_CREATED" | "ACTIVE";
type ProvisioningModalStep = "identity" | "layers" | "super-admin" | null;
type ClinicIdentity = { id: string; name: string; brandDisplayName?: string | null; establishmentType: EstablishmentType; phone?: string | null; email?: string | null; country?: string | null; city?: string | null; address?: string | null; timezone: string; currency: string; provisioningStatus: ProvisioningStatus; status: string };
type ProvisioningState = { clinic: ClinicIdentity; layers: { configured: boolean; enabledLayers: AuliaLayer[]; availableLayers: AuliaLayer[] }; superAdmin: { id: string; displayName: string; email: string } | null };

const storageKey = "aulia.provisioning.clinic-id";
const options: Array<{ id: AuliaLayer; title: string; subtitle: string; icon: typeof Cpu }> = [
  { id: "CORE", title: "Aulia Care Core", subtitle: "Admissions, dossier, soins, pharmacie, laboratoire, imagerie et facturation.", icon: HeartPulse },
  { id: "AI", title: "Aulia Care IA", subtitle: "Assistance clinique, transcription et suggestions à vérifier par le soignant.", icon: BrainCircuit },
  { id: "CONNECTED", title: "Aulia Connected Care", subtitle: "Montres Aulia, télémesures, consentements et suivi connecté sécurisé.", icon: RadioTower },
];
const establishmentLabels: Record<EstablishmentType, string> = { HOSPITAL: "Hôpital", CLINIC: "Clinique", POLYCLINIC: "Polyclinique", MEDICAL_CENTER: "Centre médical", DIAGNOSTIC_CENTER: "Centre de diagnostic", HEALTH_CENTER: "Centre de santé", OTHER: "Autre établissement" };

function stepFor(state: ProvisioningState | null): ProvisioningModalStep {
  if (!state) return "identity";
  if (!state.layers.configured) return "layers";
  if (!state.superAdmin) return "super-admin";
  return null;
}
function selectedLayersLabel(layers: AuliaLayer[]) {
  return layers.length ? layers.map((layer) => options.find((option) => option.id === layer)?.title ?? layer).join(" + ") : "Aucune couche";
}

export default function CoucheChoix() {
  const { layers: serverLayers, refresh: refreshCurrentLayers } = usePlatformLayers();
  const [provisioning, setProvisioning] = useState<ProvisioningState | null>(null);
  const [modal, setModal] = useState<ProvisioningModalStep>("identity");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [identity, setIdentity] = useState({ name: "", brandDisplayName: "", establishmentType: "CLINIC" as EstablishmentType, phone: "", email: "", country: "République démocratique du Congo", city: "", address: "", timezone: "Africa/Lubumbashi", currency: "CDF" });
  const [selected, setSelected] = useState<AuliaLayer[]>([]);
  const [superAdmin, setSuperAdmin] = useState({ firstName: "", lastName: "", email: "", username: "", password: "" });

  const loadProvisioning = useCallback(async (clinicId: string) => {
    const next = await apiFetch<ProvisioningState>(`/platform/provisioning/clinics/${clinicId}`);
    setProvisioning(next);
    setIdentity({ name: next.clinic.name || "", brandDisplayName: next.clinic.brandDisplayName || "", establishmentType: next.clinic.establishmentType, phone: next.clinic.phone || "", email: next.clinic.email || "", country: next.clinic.country || "", city: next.clinic.city || "", address: next.clinic.address || "", timezone: next.clinic.timezone || "Africa/Lubumbashi", currency: next.clinic.currency || "CDF" });
    setSelected(next.layers.enabledLayers);
    setModal(stepFor(next));
    return next;
  }, []);

  useEffect(() => {
    const clinicId = window.sessionStorage.getItem(storageKey);
    if (!clinicId) { setLoading(false); setModal("identity"); return; }
    void loadProvisioning(clinicId).catch(() => { window.sessionStorage.removeItem(storageKey); setProvisioning(null); setModal("identity"); }).finally(() => setLoading(false));
  }, [loadProvisioning]);

  const unavailable = useMemo(() => new Set(options.filter((option) => !serverLayers.availableLayers.includes(option.id)).map((option) => option.id)), [serverLayers.availableLayers]);
  const run = async (task: () => Promise<void>) => {
    setSaving(true); setMessage(null);
    try { await task(); } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "L’action n’a pas pu être effectuée." }); }
    finally { setSaving(false); }
  };
  const saveIdentity = () => run(async () => {
    if (!identity.name.trim()) throw new Error("Le nom légal de l’établissement est obligatoire.");
    let clinicId = provisioning?.clinic.id;
    if (clinicId) await apiFetch(`/platform/provisioning/clinics/${clinicId}`, { method: "PATCH", body: JSON.stringify(identity) });
    else { const clinic = await apiFetch<ClinicIdentity>("/platform/provisioning/clinics", { method: "POST", body: JSON.stringify(identity) }); clinicId = clinic.id; window.sessionStorage.setItem(storageKey, clinic.id); }
    await loadProvisioning(clinicId);
    setModal("layers");
    setMessage({ kind: "success", text: "Établissement enregistré. Choisissez maintenant les couches accordées à cet établissement." });
  });
  const saveLayers = () => run(async () => {
    if (!provisioning) throw new Error("Enregistrez d’abord l’établissement.");
    if (!selected.length) throw new Error("Choisissez au moins une couche Aulia Care.");
    await apiFetch(`/platform/provisioning/clinics/${provisioning.clinic.id}/layers`, { method: "PUT", body: JSON.stringify({ layers: selected }) });
    await loadProvisioning(provisioning.clinic.id);
    setModal("super-admin");
    await refreshCurrentLayers();
    setMessage({ kind: "success", text: `Licence enregistrée : ${selectedLayersLabel(selected)}. Créez maintenant le Super Admin de cet établissement.` });
  });
  const createSuperAdmin = () => run(async () => {
    if (!provisioning) throw new Error("Établissement introuvable.");
    await apiFetch(`/platform/provisioning/clinics/${provisioning.clinic.id}/super-admin`, { method: "POST", body: JSON.stringify(superAdmin) });
    await apiFetch(`/platform/provisioning/clinics/${provisioning.clinic.id}/activate`, { method: "POST" });
    await loadProvisioning(provisioning.clinic.id);
    setModal(null);
    setMessage({ kind: "success", text: "Établissement activé. Son Super Admin peut désormais créer uniquement les administrateurs de sa propre clinique." });
  });
  const startNewProvisioning = () => {
    window.sessionStorage.removeItem(storageKey); setProvisioning(null); setSelected([]); setSuperAdmin({ firstName: "", lastName: "", email: "", username: "", password: "" });
    setIdentity({ name: "", brandDisplayName: "", establishmentType: "CLINIC", phone: "", email: "", country: "République démocratique du Congo", city: "", address: "", timezone: "Africa/Lubumbashi", currency: "CDF" });
    setMessage(null); setModal("identity");
  };
  const toggle = (layer: AuliaLayer) => { if (!unavailable.has(layer)) setSelected((current) => current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer]); };

  if (loading) return <main className="grid min-h-[70vh] place-items-center"><span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin" />Préparation du provisioning…</span></main>;
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <section className="overflow-hidden rounded-[2rem] border border-aulia-teal/30 bg-gradient-to-br from-aulia-navy via-slate-950 to-aulia-teal p-6 text-white shadow-xl sm:p-10"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div className="max-w-3xl"><p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold tracking-[.14em]"><ShieldCheck className="h-4 w-4" />PROVISIONING INSTITUTIONNEL</p><h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Établissement, licences et responsabilités</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">Le serveur impose la chaîne DEV → établissement → couches → Super Admin → administrateurs → personnel. Aucun compte hospitalier ne peut choisir ou changer son établissement depuis le navigateur.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-slate-100"><p className="font-semibold">{provisioning?.clinic.brandDisplayName || provisioning?.clinic.name || "Nouvel établissement"}</p><p className="mt-1 text-xs text-slate-300">{provisioning ? `Statut : ${provisioning.clinic.provisioningStatus}` : "Aucun établissement en cours"}</p></div></div><div className="mt-7 grid gap-2 sm:grid-cols-3">{["1. Identité", "2. Couches", "3. Super Admin"].map((label, index) => { const done = [Boolean(provisioning), Boolean(provisioning?.layers.configured), Boolean(provisioning?.superAdmin)][index]; return <div key={label} className={`rounded-xl px-3 py-2 text-center text-xs font-bold ${done ? "bg-white text-aulia-navy" : "bg-white/10 text-slate-300"}`}>{done ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : null}{label}</div>; })}</div></section>
    {message ? <div className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${message.kind === "success" ? "border-aulia-teal/30 bg-aulia-mist text-aulia-navy dark:bg-aulia-teal/10 dark:text-aulia-mist" : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"}`}><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{message.text}</span></div> : null}
    <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Résumé sécurisé</p><h2 className="mt-1 text-xl font-bold text-aulia-navy dark:text-white">{provisioning?.clinic.brandDisplayName || provisioning?.clinic.name || "En attente de l’établissement"}</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{provisioning ? `${establishmentLabels[provisioning.clinic.establishmentType]} · ${selectedLayersLabel(provisioning.layers.enabledLayers)}` : "Commencez par enregistrer l’identité de l’établissement."}</p></div><button type="button" onClick={startNewProvisioning} className="inline-flex items-center justify-center gap-2 rounded-xl border border-aulia-teal px-4 py-2.5 text-sm font-bold text-aulia-teal transition hover:bg-aulia-mist dark:hover:bg-aulia-teal/10"><Plus className="h-4 w-4" />Nouvel établissement</button></div>{provisioning?.superAdmin ? <div className="mt-5 rounded-2xl border border-aulia-teal/20 bg-aulia-teal/5 p-4 text-sm text-slate-700 dark:bg-aulia-teal/10 dark:text-slate-200"><CheckCircle2 className="mr-2 inline h-4 w-4 text-aulia-teal" />Super Admin : <strong>{provisioning.superAdmin.displayName}</strong> — {provisioning.superAdmin.email}. Les futurs administrateurs et personnels héritent obligatoirement du même établissement.</div> : <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">Le prochain écran requis s’ouvre automatiquement. Fermer le navigateur n’annule pas l’étape déjà enregistrée : elle sera reprise à la prochaine connexion DEV.</div>}</section>
    {modal === "identity" ? <ProvisioningModal title="1. Enregistrer l’établissement" subtitle="Ces données créent le tenant immuable. Le nom et le logo pourront évoluer plus tard, jamais son identifiant technique." icon={<Building2 className="h-5 w-5" />}><div className="grid gap-4 md:grid-cols-2"><Field label="Nom légal *" value={identity.name} onChange={(value) => setIdentity((current) => ({ ...current, name: value }))} required /><Field label="Nom affiché" value={identity.brandDisplayName} onChange={(value) => setIdentity((current) => ({ ...current, brandDisplayName: value }))} /><Field label="Téléphone" value={identity.phone} type="tel" onChange={(value) => setIdentity((current) => ({ ...current, phone: value }))} /><Field label="E-mail institutionnel" value={identity.email} type="email" onChange={(value) => setIdentity((current) => ({ ...current, email: value }))} /><Field label="Pays" value={identity.country} onChange={(value) => setIdentity((current) => ({ ...current, country: value }))} /><Field label="Ville" value={identity.city} onChange={(value) => setIdentity((current) => ({ ...current, city: value }))} /><Field label="Adresse" value={identity.address} onChange={(value) => setIdentity((current) => ({ ...current, address: value }))} /><Field label="Timezone IANA" value={identity.timezone} placeholder="Africa/Lubumbashi" onChange={(value) => setIdentity((current) => ({ ...current, timezone: value }))} /><label className="block text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Type d’établissement</span><select value={identity.establishmentType} onChange={(event) => setIdentity((current) => ({ ...current, establishmentType: event.target.value as EstablishmentType }))} className="aulia-input mt-1.5"><option value="HOSPITAL">Hôpital</option><option value="CLINIC">Clinique</option><option value="POLYCLINIC">Polyclinique</option><option value="MEDICAL_CENTER">Centre médical</option><option value="DIAGNOSTIC_CENTER">Centre de diagnostic</option><option value="HEALTH_CENTER">Centre de santé</option><option value="OTHER">Autre</option></select></label><Field label="Devise" value={identity.currency} maxLength={3} onChange={(value) => setIdentity((current) => ({ ...current, currency: value.toUpperCase() }))} /></div><ModalActions><PrimaryButton onClick={saveIdentity} loading={saving}>Enregistrer l’établissement</PrimaryButton></ModalActions></ProvisioningModal> : null}
    {modal === "layers" && provisioning ? <ProvisioningModal title="2. Attribuer les couches Aulia Care" subtitle={`Cette licence appartient exclusivement à ${provisioning.clinic.brandDisplayName || provisioning.clinic.name}. Choisissez une ou plusieurs couches.`} icon={<Cpu className="h-5 w-5" />}><div className="grid gap-4 md:grid-cols-3">{options.map(({ id, title, subtitle, icon: Icon }) => { const enabled = selected.includes(id); const disabled = unavailable.has(id); return <button key={id} type="button" disabled={disabled} onClick={() => toggle(id)} className={`relative min-h-48 rounded-2xl border p-5 text-left transition ${enabled ? "border-aulia-teal bg-aulia-teal/10" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"} ${disabled ? "cursor-not-allowed opacity-50" : "hover:border-aulia-teal/60"}`}><span className={`grid h-10 w-10 place-items-center rounded-xl ${enabled ? "bg-aulia-teal text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"}`}><Icon className="h-5 w-5" /></span><h3 className="mt-4 font-bold text-slate-900 dark:text-white">{title}</h3><p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">{subtitle}</p><span className={`absolute right-4 top-4 rounded-full px-2 py-1 text-[11px] font-bold ${enabled ? "bg-aulia-teal text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>{disabled ? "Indisponible sur ce serveur" : enabled ? "Sélectionnée" : "Non sélectionnée"}</span></button>; })}</div><p className="mt-4 rounded-xl bg-aulia-mist px-4 py-3 text-sm text-aulia-navy dark:bg-aulia-teal/10 dark:text-aulia-mist">Sélection actuelle : <strong>{selectedLayersLabel(selected)}</strong>. Les combinaisons Core, IA, Connected ou tout regroupement sont autorisées.</p><ModalActions><PrimaryButton onClick={saveLayers} loading={saving} disabled={!selected.length}>Attribuer ces couches</PrimaryButton></ModalActions></ProvisioningModal> : null}
    {modal === "super-admin" && provisioning ? <ProvisioningModal title="3. Créer le Super Admin" subtitle={`Ce compte appartient automatiquement à ${provisioning.clinic.brandDisplayName || provisioning.clinic.name}. Il créera ensuite seulement les administrateurs de cet établissement.`} icon={<KeyRound className="h-5 w-5" />}><div className="grid gap-4 md:grid-cols-2"><Field label="Prénom *" value={superAdmin.firstName} onChange={(value) => setSuperAdmin((current) => ({ ...current, firstName: value }))} required /><Field label="Nom *" value={superAdmin.lastName} onChange={(value) => setSuperAdmin((current) => ({ ...current, lastName: value }))} required /><Field label="E-mail *" value={superAdmin.email} type="email" onChange={(value) => setSuperAdmin((current) => ({ ...current, email: value }))} required /><Field label="Identifiant *" value={superAdmin.username} onChange={(value) => setSuperAdmin((current) => ({ ...current, username: value }))} required /><div className="md:col-span-2"><Field label="Mot de passe initial *" value={superAdmin.password} type="password" minLength={10} onChange={(value) => setSuperAdmin((current) => ({ ...current, password: value }))} required /></div></div><p className="mt-4 rounded-xl border border-aulia-teal/20 bg-aulia-teal/5 px-4 py-3 text-sm text-slate-700 dark:bg-aulia-teal/10 dark:text-slate-200">Après la création, l’établissement est activé et toutes les créations en aval reçoivent son <code>clinicId</code> côté serveur.</p><ModalActions><PrimaryButton onClick={createSuperAdmin} loading={saving}>Créer et activer l’établissement</PrimaryButton></ModalActions></ProvisioningModal> : null}
  </main>;
}

function Field({ label, value, onChange, type = "text", required, placeholder, maxLength, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string; maxLength?: number; minLength?: number }) {
  return <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200"><span>{label}</span><input type={type} value={value} required={required} placeholder={placeholder} maxLength={maxLength} minLength={minLength} onChange={(event) => onChange(event.target.value)} className="aulia-input mt-1.5" /></label>;
}
function ProvisioningModal({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return <div className="fixed inset-0 z-[100000] grid place-items-center bg-aulia-navy/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={title}><section className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-aulia-teal/25 bg-white shadow-2xl dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)]"><header className="sticky top-0 z-10 flex items-start gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:p-7"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-aulia-teal/10 text-aulia-teal">{icon}</span><div><h2 className="text-xl font-bold text-aulia-navy dark:text-white sm:text-2xl">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{subtitle}</p></div><X className="ml-auto mt-1 h-4 w-4 text-slate-400" aria-hidden="true" /></header><div className="p-5 sm:p-7">{children}</div></section></div>;
}
function ModalActions({ children }: { children: ReactNode }) { return <div className="mt-7 flex justify-end border-t border-slate-100 pt-5 dark:border-slate-800">{children}</div>; }
function PrimaryButton({ children, loading, onClick, disabled = false }: { children: ReactNode; loading: boolean; onClick: () => void; disabled?: boolean }) { return <button type="button" onClick={onClick} disabled={disabled || loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-aulia-teal px-5 py-3 text-sm font-bold text-white transition hover:bg-aulia-teal/90 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{children}</button>; }
