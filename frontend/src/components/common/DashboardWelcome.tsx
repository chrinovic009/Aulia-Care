import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { type AuthUser, useAuth } from "../../context/AuthContext";

type DashboardWelcomeProps = {
  eyebrow: string;
  description: string;
  actionLabel: string;
  to?: string;
  onAction?: () => void;
};

function greetingForHour(hour: number) {
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function normalizedLabel(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function genderOf(user: AuthUser): "F" | "M" | null {
  const gender = normalizedLabel(user.gender || user.Employee?.[0]?.gender);
  if (["f", "femme", "feminin", "female"].includes(gender)) return "F";
  if (["m", "homme", "masculin", "male"].includes(gender)) return "M";
  return null;
}

function labProfession(user: AuthUser, gender: "F" | "M" | null) {
  const rawProfession = user.Employee?.[0]?.position?.trim() || user.specialty?.trim();
  const specialtyKey = normalizedLabel(rawProfession);
  const specialtyTitles: Record<string, string> = {
    biologiste: "biologiste",
    "biologie medicale": "biologiste",
    hematologue: "hématologue",
    hematologie: "hématologue",
    biochimiste: "biochimiste",
    biochimie: "biochimiste",
    microbiologiste: "microbiologiste",
    microbiologie: "microbiologiste",
    bacteriologiste: "bactériologiste",
    bacteriologie: "bactériologiste",
    parasitologiste: "parasitologiste",
    parasitologie: "parasitologiste",
    immunologiste: "immunologiste",
    immunologie: "immunologiste",
    virologue: "virologue",
    virologie: "virologue",
    cytologiste: "cytologiste",
    cytologie: "cytologiste",
    anatomopathologiste: "anatomopathologiste",
    anatomopathologie: "anatomopathologiste",
    laborantin: gender === "F" ? "technicienne de laboratoire" : "technicien de laboratoire",
    laborantine: gender === "F" ? "technicienne de laboratoire" : "technicien de laboratoire",
    "technicien de laboratoire": "technicien de laboratoire",
    "technicienne de laboratoire": "technicienne de laboratoire",
  };
  const profession = specialtyTitles[specialtyKey];

  if (profession) {
    const article = /^[aeiouyàâäéèêëîïôöùûüÿh]/i.test(profession) ? "l’" : gender === "F" ? "la " : "le ";
    return gender ? `${gender === "F" ? "Madame" : "Monsieur"} ${article}${profession}` : `Spécialiste : ${profession}`;
  }

  if (rawProfession && !/^[A-Z_]+$/.test(rawProfession)) {
    return gender
      ? `${gender === "F" ? "Madame" : "Monsieur"}, spécialiste en ${rawProfession}`
      : `Spécialiste en ${rawProfession}`;
  }

  if (user.primaryRole === "LAB_MANAGER") return "Responsable du laboratoire";
  if (gender) return `${gender === "F" ? "Madame" : "Monsieur"} ${gender === "F" ? "la technicienne" : "le technicien"} de laboratoire`;
  return "Personnel du laboratoire";
}

function roleGreetingTitle(user: AuthUser) {
  const gender = genderOf(user);
  const female = gender === "F";
  const maleHonorific = gender === "M" ? "Monsieur" : gender === "F" ? "Madame" : "";

  switch (user.primaryRole) {
    case "DEV":
      return female ? "Madame la Développeuse" : gender === "M" ? "Monsieur le Développeur" : "Équipe de développement";
    case "SUPER_ADMIN":
      return female ? "Madame la Directrice générale" : gender === "M" ? "Monsieur le Directeur général" : "Direction générale";
    case "ADMIN":
      return female ? "Madame l’Administratrice" : gender === "M" ? "Monsieur l’Administrateur" : "Administrateur";
    case "RECEPTIONIST":
      return maleHonorific || "Madame ou Monsieur";
    case "NURSE":
      return female ? "Madame l’Infirmière" : gender === "M" ? "Monsieur l’Infirmier" : "Personnel infirmier";
    case "PHYSICIAN":
    case "MEDICAL_DIRECTOR":
      return "Docteur";
    case "LAB_TECHNICIAN":
    case "LAB_MANAGER":
      return labProfession(user, gender);
    case "RADIOLOGIST":
      return "Docteur radiologue";
    case "SURGEON":
      return female ? "Docteure chirurgienne" : gender === "M" ? "Docteur chirurgien" : "Docteur";
    case "ANESTHESIOLOGIST":
      return "Docteur anesthésiste";
    case "MIDWIFE":
      return "Sage-femme";
    case "PARAMEDIC":
      return female ? "Madame l’Ambulancière" : gender === "M" ? "Monsieur l’Ambulancier" : "Équipe paramédicale";
    case "DISPATCHER":
      return female ? "Madame la Régulatrice" : gender === "M" ? "Monsieur le Régulateur" : "Régulation";
    case "PHARMACIST":
    case "FINANCE":
    case "CASHIER":
      return maleHonorific || "Madame ou Monsieur";
    case "PATIENT":
      return female ? "Madame" : gender === "M" ? "Monsieur" : "à vous";
    default: {
      const exhaustiveRole: never = user.primaryRole;
      return exhaustiveRole;
    }
  }
}

export default function DashboardWelcome({ eyebrow, description, actionLabel, to, onAction }: DashboardWelcomeProps) {
  const { currentUser } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const salutation = greetingForHour(now.getHours());
  const roleTitle = currentUser ? roleGreetingTitle(currentUser) : "";
  const firstName = currentUser?.firstName?.trim() || currentUser?.displayName?.trim().split(/\s+/)[0] || "";
  const title = `Hey, ${salutation.toLocaleLowerCase("fr-FR")}${roleTitle ? ` ${roleTitle}` : ""}${firstName ? ` ${firstName}` : ""} !`;
  const actionClassName = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-aulia-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-aulia-teal focus:outline-none focus:ring-2 focus:ring-aulia-teal focus:ring-offset-2 dark:bg-white dark:text-aulia-navy dark:hover:bg-aulia-mist";
  const action = to
    ? <Link to={to} className={actionClassName}>{actionLabel}<ArrowRight size={16} aria-hidden="true" /></Link>
    : <button type="button" onClick={onAction} className={actionClassName}>{actionLabel}<ArrowRight size={16} aria-hidden="true" /></button>;

  return (
    <section className="relative isolate overflow-hidden rounded-3xl border border-aulia-teal/25 bg-gradient-to-br from-aulia-mist via-white to-brand-100 p-5 text-aulia-navy shadow-sm dark:from-aulia-navy dark:via-slate-900 dark:to-aulia-teal dark:text-white sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-aulia-green/20 blur-3xl" />
      <p className="relative text-xs font-semibold uppercase tracking-[0.16em] text-aulia-teal dark:text-white/70">{eyebrow}</p>
      <div className="relative mt-3 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-white/80">{description}</p>
        </div>
        {action}
      </div>
    </section>
  );
}
