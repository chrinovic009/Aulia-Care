import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  fetchPatientsAwaitingVitals,
  formatPatientName,
  isUrgentPatient,
  NursePatient,
} from "../../api/nurse";

const formatDateTime = (value?: string | null) => {
  if (!value) return "Non renseigne";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function DashboardInfirmier() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<NursePatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPatientsAwaitingVitals();
      setPatients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la file infirmier.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const urgentPatients = useMemo(() => patients.filter(isUrgentPatient), [patients]);
  const waitingPatients = useMemo(
    () => patients.filter((patient) => patient.workflowStatus === "EN_ATTENTE_INFIRMERIE"),
    [patients],
  );
  const patientsWithoutVitals = useMemo(
    () =>
      patients.filter(
        (patient) =>
          !patient.vitals.temperature &&
          !patient.vitals.bloodPressure &&
          !patient.vitals.spo2 &&
          !patient.vitals.heartRate &&
          !patient.vitals.respiratoryRate,
      ),
    [patients],
  );

  const orderedPatients = useMemo(
    () =>
      [...patients].sort((a, b) => {
        const urgentDiff = Number(isUrgentPatient(b)) - Number(isUrgentPatient(a));
        if (urgentDiff !== 0) return urgentDiff;
        return new Date(a.arrivalAt || a.createdAt).getTime() - new Date(b.arrivalAt || b.createdAt).getTime();
      }),
    [patients],
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta
        title="Dashboard infirmier | D7 Clinique"
        description="Tableau de bord infirmier alimente par les patients PostgreSQL en attente de signes vitaux."
      />
      <PageBreadcrumb pageTitle="Dashboard soins infirmiers" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              File infirmier PostgreSQL
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
              Patients a prelever
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Seuls les patients `EN_ATTENTE_INFIRMERIE` ou avec priorite urgente sont affiches.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadPatients}
              disabled={isLoading}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {isLoading ? "Chargement" : "Actualiser"}
            </button>
            <button
              onClick={() => navigate("/nurse/patients")}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-700"
            >
              Ouvrir la file
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total file" value={patients.length} />
          <Metric label="Urgents" value={urgentPatients.length} tone="red" />
          <Metric label="En attente infirmerie" value={waitingPatients.length} tone="amber" />
          <Metric label="Sans constantes" value={patientsWithoutVitals.length} tone="slate" />
        </div>
      </section>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Priorite de passage</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Patients de la file</h2>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Chargement depuis la base...</p>
          ) : orderedPatients.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Aucun patient en attente pour l'infirmier.</p>
          ) : (
            <div className="space-y-3">
              {orderedPatients.slice(0, 8).map((patient) => {
                const urgent = isUrgentPatient(patient);
                return (
                  <div
                    key={patient.id}
                    className={`rounded-lg border p-4 ${
                      urgent
                        ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{formatPatientName(patient)}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {patient.service || "Service non affecte"} - arrivee {formatDateTime(patient.arrivalAt || patient.createdAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          urgent ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {urgent ? `Cas ${patient.priority || "urgent"}` : `Cas ${patient.priority || "normal"}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Urgences</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">Cas a traiter en premier</h2>

          <div className="mt-5 space-y-3">
            {urgentPatients.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Aucun patient urgent dans la file actuelle.</p>
            ) : (
              urgentPatients.map((patient) => (
                <div key={patient.id} className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/10">
                  <p className="font-semibold text-slate-900 dark:text-white">{formatPatientName(patient)}</p>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                    Priorite: {patient.priority || "Urgent"} - {patient.service || "Service non affecte"}
                  </p>
                  <button
                    onClick={() => navigate("/nurse/patients")}
                    className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Prelever maintenant
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "red" | "amber" | "slate";
}) {
  const styles = {
    default: "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/10 dark:text-red-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-300",
    slate: "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white",
  };

  return (
    <div className={`rounded-lg border p-4 ${styles[tone]}`}>
      <p className="text-sm opacity-75">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
