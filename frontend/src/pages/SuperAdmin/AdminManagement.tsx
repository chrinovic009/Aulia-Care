import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Plus, ShieldCheck, UserCog, X } from "lucide-react";
import { apiFetch } from "../../config/api";

type AdminRecord = { id: string; displayName: string; firstName?: string | null; lastName?: string | null; email: string; username: string; phone?: string | null; status: string; createdAt: string };
type AdminForm = { firstName: string; lastName: string; email: string; username: string; phone: string; password: string };

const emptyForm: AdminForm = { firstName: "", lastName: "", email: "", username: "", phone: "", password: "" };

export default function AdminManagement() {
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AdminForm>(emptyForm);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const users = await apiFetch<Array<AdminRecord & { primaryRole: string }>>("/users");
      setAdmins(users.filter((user) => user.primaryRole === "ADMIN"));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Impossible de charger les administrateurs." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createAdmin = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.username.trim() || !form.password) {
        throw new Error("Complétez le prénom, le nom, l’e-mail, l’identifiant et le mot de passe initial.");
      }
      const created = await apiFetch<AdminRecord>("/users/super-admin/admins", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          displayName: `${form.firstName.trim()} ${form.lastName.trim()}`,
          primaryRole: "ADMIN",
        }),
      });
      setAdmins((current) => [...current, created].sort((a, b) => a.displayName.localeCompare(b.displayName, "fr")));
      setForm(emptyForm);
      setOpen(false);
      setMessage({ kind: "success", text: `${created.displayName} a été créé comme administrateur de votre établissement. Son rattachement institutionnel a été fixé par le serveur.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "La création de l’administrateur a échoué." });
    } finally {
      setSaving(false);
    }
  };

  return <section className="space-y-5">
    <article className="aulia-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Gouvernance institutionnelle</p><h2 className="mt-2 text-xl font-bold text-aulia-navy dark:text-white">Administrateurs de l’établissement</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Chaque compte créé ici appartient automatiquement à votre établissement. Il ne peut ni sélectionner, ni manipuler une autre clinique.</p></div>
        <button type="button" onClick={() => { setMessage(null); setOpen(true); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-aulia-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-aulia-teal/90"><Plus className="h-4 w-4" />Créer un administrateur</button>
      </div>
      {message ? <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${message.kind === "success" ? "border-aulia-teal/30 bg-aulia-mist text-aulia-navy dark:bg-aulia-teal/10 dark:text-aulia-mist" : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200"}`}>{message.text}</div> : null}
    </article>
    <article className="aulia-card overflow-hidden">
      <div className="border-b border-slate-200 p-5 dark:border-slate-800"><h3 className="font-bold text-aulia-navy dark:text-white">Administrateurs enregistrés</h3></div>
      {loading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500 dark:text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin" />Chargement des administrateurs…</div> : admins.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr><th className="px-5 py-3">Administrateur</th><th className="px-5 py-3">Identifiant</th><th className="px-5 py-3">Téléphone</th><th className="px-5 py-3">Statut</th><th className="px-5 py-3">Créé le</th></tr></thead><tbody>{admins.map((admin) => <tr key={admin.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-5 py-3.5"><p className="font-semibold text-slate-800 dark:text-slate-100">{admin.displayName}</p><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{admin.email}</p></td><td className="px-5 py-3.5 text-slate-700 dark:text-slate-200">{admin.username}</td><td className="px-5 py-3.5 text-slate-700 dark:text-slate-200">{admin.phone || "Non renseigné"}</td><td className="px-5 py-3.5"><span className="rounded-full bg-aulia-teal/10 px-2.5 py-1 text-xs font-bold text-aulia-teal">{admin.status === "ACTIVE" ? "Actif" : admin.status}</span></td><td className="px-5 py-3.5 text-slate-700 dark:text-slate-200">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(admin.createdAt))}</td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-300">Aucun administrateur n’a encore été créé dans cet établissement.</div>}
    </article>
    {open ? <div className="fixed inset-0 z-[100000] grid place-items-center bg-aulia-navy/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="create-admin-title"><section className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-aulia-teal/25 bg-white shadow-2xl dark:bg-slate-900"><header className="flex items-start gap-4 border-b border-slate-200 p-5 dark:border-slate-800 sm:p-7"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-aulia-teal/10 text-aulia-teal"><UserCog className="h-5 w-5" /></span><div><h2 id="create-admin-title" className="text-xl font-bold text-aulia-navy dark:text-white">Créer un administrateur</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Cet administrateur sera automatiquement rattaché à votre établissement. Aucun choix de clinique n’est proposé.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"><X className="h-4 w-4" /></button></header><div className="p-5 sm:p-7"><div className="grid gap-4 sm:grid-cols-2"><FormField label="Prénom *" value={form.firstName} onChange={(value) => setForm((current) => ({ ...current, firstName: value }))} /><FormField label="Nom *" value={form.lastName} onChange={(value) => setForm((current) => ({ ...current, lastName: value }))} /><FormField label="E-mail *" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} /><FormField label="Identifiant *" value={form.username} onChange={(value) => setForm((current) => ({ ...current, username: value }))} /><FormField label="Téléphone" type="tel" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} /><FormField label="Mot de passe initial *" type="password" value={form.password} onChange={(value) => setForm((current) => ({ ...current, password: value }))} /></div><div className="mt-5 rounded-xl border border-aulia-teal/20 bg-aulia-teal/5 p-4 text-sm text-slate-700 dark:bg-aulia-teal/10 dark:text-slate-200"><ShieldCheck className="mr-2 inline h-4 w-4 text-aulia-teal" />Le backend ignore tout éventuel <code>clinicId</code> envoyé par un navigateur et utilise exclusivement votre établissement.</div><div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Annuler</button><button type="button" disabled={saving} onClick={() => void createAdmin()} className="inline-flex items-center gap-2 rounded-xl bg-aulia-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-aulia-teal/90 disabled:opacity-60">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Créer l’administrateur</button></div></div></section></div> : null}
  </section>;
}

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="aulia-input mt-1.5" /></label>;
}
