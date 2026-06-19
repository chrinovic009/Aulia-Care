import { useEffect, useState } from "react";
import { Save, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { AdminPageShell, Panel, StatCard, StatusBadge, formatDate } from "./adminUi";

const editableFields = [
  ["firstName", "Prenom"],
  ["lastName", "Nom"],
  ["displayName", "Nom affiche"],
  ["username", "Nom utilisateur"],
  ["email", "Email"],
  ["phone", "Telephone"],
  ["specialty", "Specialite / fonction"],
  ["nationality", "Nationalite"],
  ["addressCountry", "Pays"],
  ["addressProvince", "Province"],
  ["addressCity", "Ville"],
  ["addressNeighborhood", "Quartier"],
  ["addressStreet", "Adresse"],
] as const;

export default function ProfileAdmin() {
  const { currentUser, updateProfile, isLoading, error } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setForm(Object.fromEntries(editableFields.map(([key]) => [key, String((currentUser as any)[key] || "")])));
  }, [currentUser]);

  const save = async () => {
    const payload: any = { ...form };
    if (password.trim()) payload.password = password.trim();
    const updated = await updateProfile(payload);
    if (updated) {
      setPassword("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    }
  };

  if (!currentUser) {
    return (
      <AdminPageShell title="Profil admin" subtitle="Chargement du profil connecte.">
        <Panel title="Profil">Aucun utilisateur connecte.</Panel>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title="Profil admin"
      subtitle="Chaque utilisateur connecte peut modifier les donnees auxquelles il a acces."
      actions={
        <button onClick={save} disabled={isLoading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          <Save size={17} /> Enregistrer
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<UserRound size={20} />} label="Utilisateur" value={currentUser.displayName || currentUser.username} />
        <StatCard icon={<ShieldCheck size={20} />} label="Role" value="Administrateur" tone="blue" />
        <StatCard icon={<ShieldCheck size={20} />} label="Statut" value={currentUser.status || "ACTIVE"} tone={currentUser.status === "ACTIVE" ? "green" : "amber"} />
        <StatCard icon={<UserRound size={20} />} label="Compte cree" value={formatDate(currentUser.createdAt)} tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel title="Informations modifiables" subtitle="Ces donnees sont sauvegardees dans la table User.">
          <div className="grid gap-4 md:grid-cols-2">
            {editableFields.map(([key, label]) => (
              <label key={key} className="text-sm">
                <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">{label}</span>
                <input
                  value={form[key] || ""}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </label>
            ))}
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Bio</span>
              <textarea
                value={form.bio || String(currentUser.bio || "")}
                onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
                className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-600 dark:text-slate-300">Nouveau mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Laisser vide pour ne pas changer"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              />
            </label>
          </div>
          {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
          {saved ? <p className="mt-4 text-sm font-medium text-emerald-600">Profil mis a jour.</p> : null}
        </Panel>

        <Panel title="Acces et securite">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">Role principal</span>
              <StatusBadge label={currentUser.primaryRole} tone="blue" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">Statut</span>
              <StatusBadge label={currentUser.status || "ACTIVE"} tone={currentUser.status === "ACTIVE" ? "green" : "amber"} />
            </div>
            <p className="text-slate-500">Les changements de role, statut et permissions restent reserves a l'administration autorisee.</p>
          </div>
        </Panel>
      </div>
    </AdminPageShell>
  );
}
