import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { fetchMyPatientProfile, PatientProfile } from "../../api/patient";

type PatientClinicalPageProps = {
  mode: "dossier" | "traitements" | "suivi" | "historique";
};

const pageTitles = {
  dossier: "Dossier medical",
  traitements: "Mes traitements",
  suivi: "Suivi quotidien",
  historique: "Historique medical",
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const patientName = (profile: PatientProfile) =>
  [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ");

export default function PatientClinicalPage({ mode }: PatientClinicalPageProps) {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setProfile(await fetchMyPatientProfile());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger votre fiche patient.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    const handler = () => loadProfile();
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:consultation.created", handler);
    window.addEventListener("d7:notification.created", handler);
    return () => {
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:consultation.created", handler);
      window.removeEventListener("d7:notification.created", handler);
    };
  }, []);

  const latestVitals = useMemo(() => {
    const vitals: Record<string, string> = {};
    profile?.vitalSigns?.forEach((vital) => {
      if (!vitals[vital.type]) vitals[vital.type] = `${vital.value}${vital.unit ? ` ${vital.unit}` : ""}`;
    });
    return vitals;
  }, [profile?.vitalSigns]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title={`${pageTitles[mode]} | D7 Clinique`} description="Espace patient alimente par PostgreSQL." />
      <PageBreadcrumb pageTitle={pageTitles[mode]} />

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Chargement de votre fiche...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      ) : profile ? (
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase text-slate-500">Fiche patient</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{patientName(profile)}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {profile.gender || "-"} - {profile.phone || "Telephone non renseigne"} - {profile.service?.name || "Service non renseigne"}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Metric label="Statut" value={profile.workflowStatus || "-"} />
              <Metric label="Priorite" value={profile.priority || "Normale"} />
              <Metric label="Groupe sanguin" value={profile.bloodType || "-"} />
              <Metric label="Reception" value={profile.receptionist?.displayName || "-"} />
            </div>
          </section>

          {mode === "dossier" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Informations personnelles">
                <Info label="Email" value={profile.email || "-"} />
                <Info label="Adresse" value={profile.address || "-"} />
                <Info label="Nationalite" value={profile.nationality || "-"} />
                <Info label="Contact urgence" value={[profile.emergencyContact, profile.emergencyPhone].filter(Boolean).join(" - ") || "-"} />
              </Panel>
              <Panel title="Dernieres constantes">
                <Info label="Temperature" value={latestVitals.TEMPERATURE || "-"} />
                <Info label="Tension" value={latestVitals.BLOOD_PRESSURE || "-"} />
                <Info label="SpO2" value={latestVitals.OXYGEN_SATURATION || "-"} />
                <Info label="Pouls" value={latestVitals.HEART_RATE || "-"} />
                <Info label="Respiration" value={latestVitals.RESPIRATORY_RATE || "-"} />
                <Info label="Poids" value={latestVitals.WEIGHT || "-"} />
                <Info label="Taille" value={latestVitals.HEIGHT || "-"} />
                <Info label="Perimetre thoracique" value={latestVitals.CHEST_CIRCUMFERENCE || "-"} />
                <Info label="Perimetre brachial" value={latestVitals.ARM_CIRCUMFERENCE || "-"} />
              </Panel>
              <ListPanel title="Consultations" items={(profile.consultations || []).map((item) => ({
                title: item.diagnosis || item.clinicalSummary || "Consultation",
                subtitle: `${formatDate(item.createdAt)} - ${item.provider?.displayName || "Medecin"}`,
              }))} />
              <ListPanel title="Rendez-vous" items={(profile.appointments || []).map((item) => ({
                title: item.reason || item.serviceUnit?.name || item.status,
                subtitle: formatDate(item.scheduledAt),
              }))} />
            </div>
          )}

          {mode === "traitements" && (
            <ListPanel title="Traitements prescrits" items={(profile.prescriptions || []).map((item) => ({
              title: item.instruction || item.status || "Prescription",
              subtitle: `${formatDate(item.prescribingDate)} - ${item.prescriber?.displayName || "Medecin"}`,
              text: item.lineItems?.map((line) => [line.dosage, line.frequency, line.notes].filter(Boolean).join(" - ")).join(", "),
            }))} />
          )}

          {mode === "suivi" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Constantes recentes">
                {(profile.vitalSigns || []).slice(0, 10).map((vital) => (
                  <Info key={`${vital.type}-${vital.recordedAt}`} label={vital.type} value={`${vital.value}${vital.unit ? ` ${vital.unit}` : ""} - ${formatDate(vital.recordedAt)}`} />
                ))}
                {(profile.vitalSigns || []).length === 0 && <Empty />}
              </Panel>
              <ListPanel title="Hospitalisations" items={(profile.hospitalizations || []).map((item) => ({
                title: item.admissionReason || item.status,
                subtitle: `${formatDate(item.admittedAt)}${item.dischargedAt ? ` - ${formatDate(item.dischargedAt)}` : ""}`,
              }))} />
            </div>
          )}

          {mode === "historique" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <ListPanel title="Historique medical" items={(profile.medicalHistories || []).map((item) => ({
                title: item.kind || "Evenement",
                subtitle: formatDate(item.eventDate),
                text: item.details || "",
              }))} />
              <ListPanel title="Examens laboratoire" items={(profile.labRequests || []).map((item) => ({
                title: item.specimenType || item.status,
                subtitle: formatDate(item.requestedAt),
                text: item.results?.map((result) => `${result.resultName}: ${result.resultValue} ${result.units || ""}`).join(", "),
              }))} />
              <ListPanel title="Imagerie" items={(profile.imagingRequests || []).map((item) => ({
                title: `${item.modality} - ${item.bodyPart}`,
                subtitle: formatDate(item.createdAt),
                text: item.report?.impression || item.status,
              }))} />
              <ListPanel title="Factures" items={(profile.invoices || []).map((item) => ({
                title: `Facture ${item.status}`,
                subtitle: formatDate(item.issuedAt),
                text: `Total: ${Number(item.totalAmount).toLocaleString("fr-FR")} - Reste: ${Number(item.balanceDue).toLocaleString("fr-FR")}`,
              }))} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: Array<{ title: string; subtitle: string; text?: string }> }) {
  return (
    <Panel title={title}>
      {items.length === 0 ? <Empty /> : items.map((item, index) => (
        <div key={`${item.title}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
          <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
          <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p>
          {item.text && <p className="mt-2 text-slate-600 dark:text-slate-300">{item.text}</p>}
        </div>
      ))}
    </Panel>
  );
}

function Empty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}
