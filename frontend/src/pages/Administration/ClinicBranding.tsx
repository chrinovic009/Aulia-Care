import { ChangeEvent, useEffect, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";
import { invalidateClinicDocumentBrandingCache } from "../../utils/clinicDocumentBranding";

type ClinicBranding = {
  name: string;
  brandDisplayName?: string | null;
  documentLogoUrl?: string | null;
  documentLogoUpdatedAt?: string | null;
  legalName?: string | null;
  registrationNumber?: string | null;
  rccmNumber?: string | null;
  taxNumber?: string | null;
  nationalIdNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  documentFooter?: string | null;
};

const emptyIdentity = {
  legalName: "", registrationNumber: "", rccmNumber: "", taxNumber: "", nationalIdNumber: "",
  phone: "", email: "", address: "", city: "", country: "", documentFooter: "",
};

export default function ClinicBrandingPage() {
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [identity, setIdentity] = useState(emptyIdentity);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ClinicBranding>("/administration/clinic-branding").then((data) => {
      setBranding(data);
      setName(data.brandDisplayName || data.name || "");
      setLogo(data.documentLogoUrl || null);
      setIdentity({
        legalName: data.legalName || "", registrationNumber: data.registrationNumber || "", rccmNumber: data.rccmNumber || "", taxNumber: data.taxNumber || "", nationalIdNumber: data.nationalIdNumber || "",
        phone: data.phone || "", email: data.email || "", address: data.address || "", city: data.city || "", country: data.country || "", documentFooter: data.documentFooter || "",
      });
    }).catch(() => setMessage("Impossible de charger l’identité de l’établissement."));
  }, []);

  const selectLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMessage("Sélectionnez une image PNG, JPEG ou WebP.");
    if (file.size > 500 * 1024) return setMessage("Le logo doit faire au maximum 500 Ko.");
    const reader = new FileReader();
    reader.onload = () => { setLogo(typeof reader.result === "string" ? reader.result : null); setMessage(null); };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const saved = await apiFetch<ClinicBranding>("/administration/clinic-branding", { method: "PATCH", body: JSON.stringify({ brandDisplayName: name, documentLogoUrl: logo, ...identity }) });
      setBranding(saved); setName(saved.brandDisplayName || saved.name); setLogo(saved.documentLogoUrl || null);
      invalidateClinicDocumentBrandingCache();
      setMessage("Identité enregistrée. Les nouveaux documents utilisent désormais ces coordonnées et ce logo, ou le logo Aulia Care si aucun logo n’est fourni.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <PageMeta title="Identité de l’hôpital | Aulia Care" description="Configuration du nom et du logo officiel de l’établissement." />
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-aulia-teal">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Identité de l’hôpital</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Aulia Care reste la plateforme. Les informations ci-dessous identifient votre établissement sur les documents officiels : nom, logo, coordonnées et numéros légaux.</p>
    </section>
    <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[1fr_260px] sm:p-7">
      <div className="space-y-5">
        <label className="block"><span className="text-sm font-semibold text-slate-800 dark:text-white">Nom affiché de l’établissement</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={branding?.name || "Ex. Clinique Saint-Raphaël"} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        <label className="block"><span className="text-sm font-semibold text-slate-800 dark:text-white">Dénomination légale</span><input value={identity.legalName} onChange={(e) => setIdentity((current) => ({ ...current, legalName: e.target.value }))} maxLength={160} placeholder="Nom légal de l’établissement" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        <label className="block"><span className="text-sm font-semibold text-slate-800 dark:text-white">Logo des documents officiels</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectLogo} className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-aulia-mist file:px-3 file:py-2 file:font-semibold file:text-aulia-navy dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-white" /><span className="mt-2 block text-xs text-slate-500">PNG, JPEG ou WebP · 500 Ko maximum. Il peut être remplacé ou supprimé à tout moment.</span></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <IdentityInput label="Téléphone officiel" value={identity.phone} onChange={(value) => setIdentity((current) => ({ ...current, phone: value }))} />
          <IdentityInput label="E-mail officiel" value={identity.email} type="email" onChange={(value) => setIdentity((current) => ({ ...current, email: value }))} />
          <IdentityInput label="RCCM" value={identity.rccmNumber} onChange={(value) => setIdentity((current) => ({ ...current, rccmNumber: value }))} />
          <IdentityInput label="Numéro fiscal / NIF" value={identity.taxNumber} onChange={(value) => setIdentity((current) => ({ ...current, taxNumber: value }))} />
          <IdentityInput label="Numéro d’agrément / ID" value={identity.nationalIdNumber} onChange={(value) => setIdentity((current) => ({ ...current, nationalIdNumber: value }))} />
          <IdentityInput label="N° d’enregistrement" value={identity.registrationNumber} onChange={(value) => setIdentity((current) => ({ ...current, registrationNumber: value }))} />
        </div>
        <label className="block"><span className="text-sm font-semibold text-slate-800 dark:text-white">Adresse officielle</span><input value={identity.address} onChange={(e) => setIdentity((current) => ({ ...current, address: e.target.value }))} maxLength={240} placeholder="Avenue, quartier, commune" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><IdentityInput label="Ville" value={identity.city} onChange={(value) => setIdentity((current) => ({ ...current, city: value }))} /><IdentityInput label="Pays" value={identity.country} onChange={(value) => setIdentity((current) => ({ ...current, country: value }))} /></div>
        <label className="block"><span className="text-sm font-semibold text-slate-800 dark:text-white">Pied de page documentaire</span><textarea value={identity.documentFooter} onChange={(e) => setIdentity((current) => ({ ...current, documentFooter: e.target.value }))} maxLength={500} placeholder="Ex. Document confidentiel — à présenter avec une pièce d’identité." className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        <div className="flex flex-wrap gap-3"><button type="button" onClick={save} disabled={saving || !name.trim()} className="rounded-xl border border-[#087c73] bg-[#0D9488] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#087c73] focus:outline-none focus:ring-4 focus:ring-[#0D9488]/25 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer l’identité"}</button><button type="button" onClick={() => setLogo(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold dark:border-slate-700 dark:text-white">Supprimer le logo</button></div>
        {message && <p className="rounded-xl bg-aulia-mist px-4 py-3 text-sm text-aulia-navy dark:bg-slate-800 dark:text-slate-100">{message}</p>}
      </div>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aperçu impression</p><div className="mt-5 grid min-h-44 place-items-center rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">{logo ? <img src={logo} alt="Logo de l’établissement" className="max-h-28 max-w-full object-contain" /> : <img src="/images/logo/icone.png" alt="Logo Aulia Care par défaut" className="max-h-24 max-w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</div><p className="mt-4 text-center text-sm font-semibold text-slate-800 dark:text-white">{name || branding?.name || "Établissement"}</p><p className="mt-1 text-center text-xs text-slate-500">{[identity.address, identity.city, identity.phone].filter(Boolean).join(" · ") || "Coordonnées à renseigner"}</p></div>
    </section>
  </div>;
}

function IdentityInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="text-sm font-semibold text-slate-800 dark:text-white">{label}</span><input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>;
}
