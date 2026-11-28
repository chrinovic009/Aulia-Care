import { lazy, Suspense, useState } from "react";
import { useAuth } from "../../context/AuthContext";

const RhPaie = lazy(() => import("./RhPaie"));
const RhContrats = lazy(() => import("./RhContrats"));
const RhPresences = lazy(() => import("./RhPresences"));
const RhConges = lazy(() => import("./RhConges"));
const RhRegles = lazy(() => import("./RhRegles"));

type Tab = "paie" | "contrats" | "presences" | "conges" | "regles";
const LABELS: Record<Tab, string> = { paie: "Paie", contrats: "Contrats & salaires", presences: "Présences & retards", conges: "Congés & remplacements", regles: "Règles" };

/**
 * Human resources. Finance manages payroll; the administration decides leave,
 * replacements and attendance corrections; the super administration reads
 * everything. Each role starts on the tab it works with.
 */
export default function RessourcesHumaines() {
  const { currentUser } = useAuth();
  const role = currentUser?.primaryRole;
  const tabs: Tab[] = role === "FINANCE" ? ["paie", "contrats", "presences", "conges", "regles"] : role === "ADMIN" ? ["conges", "presences", "contrats", "paie", "regles"] : ["paie", "conges", "presences", "contrats", "regles"];
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const subtitle = role === "FINANCE" ? "Vous gérez la paie ; l’administration décide des congés et remplacements." : role === "ADMIN" ? "Vous décidez des congés, remplacements et justifications ; la paie est gérée par la finance." : "Consultation de la paie, des contrats, des présences et des congés de l’établissement.";
  return (
    <section className="space-y-5 p-4 sm:p-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-aulia-teal">Ressources humaines</p>
        <h1 className="text-2xl font-bold text-aulia-navy dark:text-white">Ressources humaines</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
        {tabs.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === item ? "border-aulia-teal text-aulia-teal" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{LABELS[item]}</button>
        ))}
      </nav>
      <Suspense fallback={<p className="text-sm text-slate-500">Chargement…</p>}>
        {tab === "paie" && <RhPaie />}
        {tab === "contrats" && <RhContrats />}
        {tab === "presences" && <RhPresences />}
        {tab === "conges" && <RhConges />}
        {tab === "regles" && <RhRegles />}
      </Suspense>
    </section>
  );
}
