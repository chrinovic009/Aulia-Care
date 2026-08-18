import { ChangeEvent, useEffect, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";

type ClinicBranding = {
  name: string;
  brandDisplayName?: string | null;
  documentLogoUrl?: string | null;
  documentLogoUpdatedAt?: string | null;
};

export default function ClinicBrandingPage() {
  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ClinicBranding>("/administration/clinic-branding").then((data) => {
      setBranding(data);
      setName(data.brandDisplayName || data.name || "");
      setLogo(data.documentLogoUrl || null);
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
      const saved = await apiFetch<ClinicBranding>("/administration/clinic-branding", { method: "PATCH", body: JSON.stringify({ brandDisplayName: name, documentLogoUrl: logo }) });
      setBranding(saved); setName(saved.brandDisplayName || saved.name); setLogo(saved.documentLogoUrl || null);
      setMessage("Identité enregistrée. Les nouveaux documents utiliseront ce logo.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Enregistrement impossible."); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <PageMeta title="Identité de l’hôpital | Aulia Care" description="Configuration du nom et du logo officiel de l’établissement." />
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-aulia-teal">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Identité de l’hôpital</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Aulia Care conserve son logo dans l’application. Le nom ci-dessous apparaît sous ce logo, tandis que le logo de l’hôpital est réservé aux documents officiels imprimés.</p>
    </section>
    <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[1fr_260px] sm:p-7">
      <div className="space-y-5">
        <label className="block"><span className="text-sm font-semibold text-slate-800 dark:text-white">Nom affiché de l’établissement</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={branding?.name || "Ex. D7 Clinique"} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-aulia-teal dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
        <label className="block"><span className="text-sm font-semibold text-slate-800 dark:text-white">Logo des documents officiels</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectLogo} className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-aulia-mist file:px-3 file:py-2 file:font-semibold file:text-aulia-navy dark:text-slate-300 dark:file:bg-slate-800 dark:file:text-white" /><span className="mt-2 block text-xs text-slate-500">PNG, JPEG ou WebP · 500 Ko maximum. Il peut être remplacé ou supprimé à tout moment.</span></label>
        <div className="flex flex-wrap gap-3"><button type="button" onClick={save} disabled={saving || !name.trim()} className="rounded-xl bg-aulia-navy px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer l’identité"}</button><button type="button" onClick={() => setLogo(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold dark:border-slate-700 dark:text-white">Supprimer le logo</button></div>
        {message && <p className="rounded-xl bg-aulia-mist px-4 py-3 text-sm text-aulia-navy dark:bg-slate-800 dark:text-slate-100">{message}</p>}
      </div>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aperçu impression</p><div className="mt-5 grid min-h-44 place-items-center rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">{logo ? <img src={logo} alt="Logo de l’établissement" className="max-h-28 max-w-full object-contain" /> : <span className="text-center text-sm text-slate-500">Aucun logo sélectionné</span>}</div><p className="mt-4 text-center text-sm font-semibold text-slate-800 dark:text-white">{name || branding?.name || "Établissement"}</p></div>
    </section>
  </div>;
}
