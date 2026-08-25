import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Cpu, HeartPulse, LoaderCircle, RadioTower, ShieldCheck } from "lucide-react";
import { type AuliaLayer, usePlatformLayers } from "../../context/PlatformLayersContext";

const options: Array<{ id: AuliaLayer; title: string; subtitle: string; icon: typeof Cpu }> = [
  { id: "CORE", title: "Aulia Care Core", subtitle: "Dossier patient, admissions, soins, pharmacie, laboratoire, imagerie et facturation.", icon: HeartPulse },
  { id: "AI", title: "Aulia Care IA", subtitle: "Assistance clinique structurée, transcription et suggestions à valider par le soignant.", icon: BrainCircuit },
  { id: "CONNECTED", title: "Aulia Connected Care", subtitle: "Montres Aulia, télémesures, consentements et suivi connecté sécurisé.", icon: RadioTower },
];

export default function CoucheChoix() {
  const { layers, isLoading, save } = usePlatformLayers();
  const [selected, setSelected] = useState<AuliaLayer[]>(["CORE"]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading) setSelected(layers.enabledLayers);
  }, [isLoading, layers.enabledLayers]);

  const unavailable = useMemo(() => new Set(options.filter((item) => !layers.availableLayers.includes(item.id)).map((item) => item.id)), [layers.availableLayers]);
  const toggle = (layer: AuliaLayer) => {
    if (layer === "CORE" || unavailable.has(layer)) return;
    setSelected((current) => current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer]);
  };
  const persist = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await save(selected);
      setMessage(`Configuration enregistrée : ${updated.enabledLayers.join(" + ")}. Les routes et menus exclus sont maintenant verrouillés.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La configuration n’a pas pu être enregistrée.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2rem] border border-aulia-teal/20 bg-gradient-to-br from-aulia-navy via-slate-950 to-aulia-teal p-6 text-white shadow-xl sm:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide"><ShieldCheck className="h-4 w-4" /> INSTALLATION SÉCURISÉE</div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Choix des couches Aulia Care</h1>
            <p className="mt-3 text-sm leading-6 text-slate-200 sm:text-base">Cette sélection définit les capacités autorisées sur cette installation. Elle est appliquée par l’API et par l’interface : un menu masqué n’est jamais une permission.</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-slate-100">
            <p className="font-semibold">État de l’installation</p>
            <p className="mt-1 text-slate-300">{layers.configured ? `Version ${layers.configurationVersion} configurée` : "Configuration initiale à valider"}</p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        <div className="mb-6"><h2 className="text-xl font-bold text-slate-900 dark:text-white">Capacités à activer</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Core est le socle permanent : admissions, soins, facturation, laboratoires, radiologie et toutes les interfaces classiques restent disponibles. Active IA et/ou Connected pour ajouter leurs capacités spécialisées.</p></div>
        <div className="grid gap-4 lg:grid-cols-3">
          {options.map(({ id, title, subtitle, icon: Icon }) => {
            const enabled = selected.includes(id);
            const disabled = unavailable.has(id);
            return <button key={id} type="button" disabled={id === "CORE" || disabled} onClick={() => toggle(id)} className={`relative min-h-52 rounded-3xl border p-5 text-left transition ${enabled ? "border-aulia-teal bg-aulia-teal/10 shadow-sm" : "border-slate-200 bg-white hover:border-aulia-teal/50 dark:border-slate-700 dark:bg-slate-950"} ${(id === "CORE" || disabled) ? "cursor-default" : "cursor-pointer"}`}>
              <div className={`grid h-11 w-11 place-items-center rounded-2xl ${enabled ? "bg-aulia-teal text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"}`}><Icon className="h-6 w-6" /></div>
              <h3 className="mt-5 font-bold text-slate-900 dark:text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{subtitle}</p>
              <span className={`absolute right-4 top-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-aulia-teal text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{disabled ? "Serveur non prêt" : id === "CORE" ? "Socle permanent" : enabled ? <><CheckCircle2 className="h-3.5 w-3.5" /> Activée</> : "Désactivée"}</span>
            </button>;
          })}
        </div>
        {message && <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${message.startsWith("Configuration") ? "border-aulia-teal/30 bg-aulia-teal/10 text-aulia-navy dark:text-aulia-mint" : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"}`}>{message}</div>}
        <div className="mt-7 flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Chaque changement est journalisé. Les processus serveur désactivés par `.env` ne peuvent pas être activés depuis le navigateur.</p><button type="button" onClick={persist} disabled={saving || isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-aulia-teal px-5 py-3 text-sm font-bold text-white transition hover:bg-aulia-teal/90 disabled:cursor-not-allowed disabled:opacity-60">{saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{layers.configured ? "Mettre à jour les couches" : "Valider cette installation"}</button></div>
      </section>
    </main>
  );
}
