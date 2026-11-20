import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

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

export default function DashboardWelcome({ eyebrow, description, actionLabel, to, onAction }: DashboardWelcomeProps) {
  const { currentUser } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const firstName = currentUser?.firstName?.trim() || currentUser?.displayName?.trim().split(/\s+/)[0] || "";
  const title = `${greetingForHour(now.getHours())}${firstName ? ` ${firstName}` : ""} !`;
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
