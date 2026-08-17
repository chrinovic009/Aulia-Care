import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { fetchMyPatientProfile, fetchWearableDashboard, PatientProfile, WearableDashboard } from "../../api/patient";

const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const cdf = (value: string | number) => `${Number(value || 0).toLocaleString("fr-CD")} CDF`;
const nameOf = (person?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null) => person?.displayName || [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "Équipe soignante";

export default function PatientDashboard() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [wearable, setWearable] = useState<WearableDashboard | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const patient = await fetchMyPatientProfile();
      setProfile(patient);
      setWearable(await fetchWearableDashboard(patient.id));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Votre espace patient est momentanément indisponible.");
    }
  };

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("d7:patient.updated", refresh);
    window.addEventListener("d7:wearable.measurement", refresh);
    window.addEventListener("d7:invoice.updated", refresh);
    return () => {
      window.removeEventListener("d7:patient.updated", refresh);
      window.removeEventListener("d7:wearable.measurement", refresh);
      window.removeEventListener("d7:invoice.updated", refresh);
    };
  }, []);

  const measures = useMemo(() => wearable?.wearableDevices.flatMap((device) => device.measurements).sort((a, b) => +new Date(b.measuredAt) - +new Date(a.measuredAt)).slice(0, 4) || [], [wearable]);
  const nextAppointment = profile?.appointments?.filter((item) => new Date(item.scheduledAt) >= new Date() && ["SCHEDULED", "CONFIRMED"].includes(item.status)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0];
  const openInvoice = profile?.invoices?.filter((item) => Number(item.balanceDue) > 0).reduce((sum, item) => sum + Number(item.balanceDue), 0) || 0;
  const currentStay = profile?.hospitalizations?.find((item) => item.status === "ADMITTED" || !item.dischargedAt);

  return <div className="space-y-6">
    <PageMeta title="Mon espace santé | Aulia Care" description="Tableau de bord personnel et sécurisé Aulia Care." />
    <section className="relative overflow-hidden rounded-3xl border border-aulia-teal/20 bg-gradient-to-br from-aulia-navy via-aulia-navy to-aulia-teal p-5 text-white shadow-xl sm:p-8">
      <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-aulia-green/20 blur-2xl" />
      <p className="text-sm font-medium text-white/75">Aulia Care · Votre espace santé sécurisé</p>
      <div className="relative mt-3 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><h1 className="text-2xl font-semibold sm:text-3xl">Bonjour {profile?.firstName || ""}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Retrouvez vos soins, résultats, rendez-vous et informations de suivi. Les données affichées proviennent de votre dossier Aulia Care.</p></div>
        <Link to="/suivi-quotidien" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-aulia-navy transition hover:bg-aulia-mist">Faire mon suivi du jour</Link>
      </div>
    </section>
    {error ? <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">{error}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Prochain rendez-vous" value={nextAppointment ? dateTime(nextAppointment.scheduledAt) : "Aucun rendez-vous"} detail={nextAppointment?.serviceUnit?.name || nextAppointment?.reason || "Vous pouvez en demander un."} to="/rendez-vous" />
      <Metric label="Factures à régler" value={cdf(openInvoice)} detail={openInvoice > 0 ? "Paiement sécurisé disponible" : "Aucun solde en attente"} to="/paiements" tone={openInvoice > 0 ? "amber" : "green"} />
      <Metric label="Montre connectée" value={wearable?.wearableDevices.length ? `${wearable.wearableDevices.length} appareil(s)` : "Non associée"} detail={wearable?.wearableDevices[0]?.lastSeenAt ? `Dernière synchronisation : ${dateTime(wearable.wearableDevices[0].lastSeenAt)}` : "Associez une montre eSIM avec l'équipe."} to="/montre-connectee" />
      <Metric label="Hospitalisation" value={currentStay ? "Séjour en cours" : "Aucun séjour actif"} detail={currentStay ? `${currentStay.ServiceUnit?.name || "Service"} · lit ${currentStay.bedNumber || "à confirmer"}` : "Historique disponible"} to="/hospitalisation" />
    </section>
    <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
      <article className="aulia-card p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-aulia-teal">Mes indicateurs connectés</p><h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Dernières mesures de votre montre</h2></div><Link to="/montre-connectee" className="text-sm font-semibold text-aulia-teal hover:underline">Voir le suivi</Link></div>
        {measures.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{measures.map((measure) => <div key={measure.id} className="rounded-2xl bg-aulia-mist/65 p-4 dark:bg-white/5"><p className="text-xs text-slate-500 dark:text-slate-400">{humanMetric(measure.metric)}</p><p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{measure.value} <span className="text-sm font-medium">{measure.unit}</span></p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{dateTime(measure.measuredAt)}</p></div>)}</div> : <Empty text="Aucune mesure de montre transmise pour le moment. Cette page ne crée aucune donnée de santé fictive." />}
      </article>
      <article className="aulia-card p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-wide text-aulia-teal">Parcours de soins</p><h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Accès rapide</h2><div className="mt-4 grid gap-2">{[
        ["Examens et résultats", "/examens-resultats", "Les résultats validés sont publiés ici."],
        ["Traitements", "/traitements", "Consignes prescrites par votre médecin."],
        ["Mon dossier médical", "/dossier-medical", "Consultations et données administratives."],
        ["Mes enfants", "/enfants", "Suivi parental sécurisé et limité."],
      ].map(([title, to, description]) => <Link key={to} to={to} className="rounded-xl border border-slate-200 p-3 transition hover:border-aulia-teal hover:bg-aulia-mist/60 dark:border-white/10 dark:hover:bg-white/5"><p className="font-semibold text-slate-800 dark:text-white">{title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p></Link>)}</div></article>
    </section>
    <section className="grid gap-5 xl:grid-cols-2"><article className="aulia-card p-5 sm:p-6"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Mes soins récents</h2>{profile?.consultations?.length ? <div className="mt-4 space-y-3">{profile.consultations.slice(0, 4).map((consultation, index) => <div key={consultation.id || index} className="border-l-2 border-aulia-teal pl-4"><p className="font-medium text-slate-800 dark:text-white">{consultation.diagnosis || consultation.clinicalSummary || "Consultation médicale"}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{dateTime(consultation.createdAt)} · {nameOf(consultation.provider)}</p></div>)}</div> : <Empty text="Aucune consultation disponible dans votre dossier." />}</article>
      <article className="aulia-card p-5 sm:p-6"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">Mon équipe pendant le séjour</h2>{currentStay ? <div className="mt-4 space-y-3 text-sm"><Info label="Médecin référent" value={nameOf(currentStay.physician)} /><Info label="Infirmier·ère référent·e" value={nameOf(currentStay.nurseInCharge)} />{currentStay.nurseAssignments?.map((assignment, index) => <Info key={`${assignment.coverage}-${index}`} label={`Relais ${assignment.coverage === "DAY" ? "de jour" : "de nuit"}`} value={nameOf(assignment.nurse)} />)}</div> : <Empty text="Aucun séjour hospitalier actif." />}</article></section>
  </div>;
}

function Metric({ label, value, detail, to, tone = "teal" }: { label: string; value: string; detail: string; to: string; tone?: "teal" | "amber" | "green" }) { const colors = { teal: "border-aulia-teal/25", amber: "border-amber-400/35", green: "border-aulia-green/35" }; return <Link to={to} className={`aulia-card block p-4 transition hover:-translate-y-0.5 ${colors[tone]}`}><p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p></Link>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 rounded-xl bg-aulia-mist/60 px-3 py-2 dark:bg-white/5"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className="text-right font-medium text-slate-800 dark:text-white">{value}</span></div>; }
function Empty({ text }: { text: string }) { return <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm leading-6 text-slate-500 dark:border-white/15 dark:text-slate-400">{text}</p>; }
function humanMetric(metric: string) { return ({ HEART_RATE_BPM: "Fréquence cardiaque", BLOOD_PRESSURE_SYSTOLIC_MMHG: "Tension systolique", BLOOD_PRESSURE_DIASTOLIC_MMHG: "Tension diastolique", BLOOD_GLUCOSE_MG_DL: "Glycémie", SPO2_PERCENT: "Saturation en oxygène", WEIGHT_KG: "Poids", BODY_FAT_PERCENT: "Masse grasse" } as Record<string, string>)[metric] || metric; }
