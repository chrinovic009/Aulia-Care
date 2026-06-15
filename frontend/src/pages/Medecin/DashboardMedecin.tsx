import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { DoctorPatient, fetchDoctorAssignedPatients, formatDoctorPatientName } from "../../api/doctor";

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const latestVital = (patient: DoctorPatient, type: string) =>
  patient.vitalSigns?.find((vital) => vital.type === type)?.value || "-";

export default function DashboardMedecin() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatient | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDoctorAssignedPatients();
      setPatients(data);
      setSelectedPatient((current) => current || data[0] || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la file medecin.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
    const handler = () => loadPatients();
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:consultation.created", handler);
    return () => {
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:consultation.created", handler);
    };
  }, []);

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return patients;
    return patients.filter((patient) =>
      [formatDoctorPatientName(patient), patient.service, patient.phone, patient.priority]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [patients, query]);

  const metrics = useMemo(() => {
    const openConsultations = patients.filter((patient) =>
      patient.consultations?.some((consultation) => consultation.status !== "COMPLETED"),
    ).length;
    const urgent = patients.filter((patient) =>
      ["urgent", "urgence", "prioritaire", "critical", "critique"].includes((patient.priority || "").toLowerCase()),
    ).length;
    return {
      patients: patients.length,
      openConsultations,
      urgent,
      prescriptions: patients.reduce((sum, patient) => sum + (patient.prescriptions?.length || 0), 0),
    };
  }, [patients]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Dashboard medecin | D7 Clinique" description="File medecin alimentee par PostgreSQL." />
      <PageBreadcrumb pageTitle="Dashboard medecin" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Source PostgreSQL</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Patients orientes vers vous</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Patients envoyes par l'infirmier apres la prise des signes vitaux.
            </p>
          </div>
          <button onClick={loadPatients} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
            Actualiser
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="Patients" value={metrics.patients} />
          <Metric label="Consultations ouvertes" value={metrics.openConsultations} tone="blue" />
          <Metric label="Urgents" value={metrics.urgent} tone="red" />
          <Metric label="Prescriptions" value={metrics.prescriptions} tone="green" />
        </div>
      </section>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher patient, service, priorite..."
            className="mb-4 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />

          {isLoading ? (
            <p className="text-sm text-slate-500">Chargement...</p>
          ) : filteredPatients.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun patient oriente vers vous.</p>
          ) : (
            <div className="space-y-3">
              {filteredPatients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => setSelectedPatient(patient)}
                  className={`w-full rounded-lg border p-3 text-left ${
                    selectedPatient?.id === patient.id
                      ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40"
                      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                  }`}
                >
                  <p className="font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</p>
                  <p className="mt-1 text-xs text-slate-500">{patient.service || "Service non renseigne"}</p>
                  <p className="mt-1 text-xs text-slate-500">Priorite: {patient.priority || "Normale"}</p>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {!selectedPatient ? (
            <p className="text-sm text-slate-500">Selectionnez un patient.</p>
          ) : (
            <div>
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(selectedPatient)}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedPatient.gender || "-"} - {selectedPatient.phone || "Telephone non renseigne"} - {selectedPatient.service || "Service non renseigne"}
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                  {selectedPatient.workflowStatus || "Statut non renseigne"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-5">
                <Vital label="Temperature" value={latestVital(selectedPatient, "TEMPERATURE")} />
                <Vital label="Tension" value={latestVital(selectedPatient, "BLOOD_PRESSURE")} />
                <Vital label="SpO2" value={latestVital(selectedPatient, "OXYGEN_SATURATION")} />
                <Vital label="Pouls" value={latestVital(selectedPatient, "HEART_RATE")} />
                <Vital label="Respiration" value={latestVital(selectedPatient, "RESPIRATORY_RATE")} />
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <Panel title="Consultations">
                  {(selectedPatient.consultations || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.consultations?.map((consultation) => (
                      <Item key={consultation.id} title={consultation.chiefComplaint || consultation.status} subtitle={formatDateTime(consultation.createdAt)} text={consultation.clinicalSummary || consultation.diagnosis || "Aucune note clinique."} />
                    ))
                  )}
                </Panel>

                <Panel title="Prescriptions">
                  {(selectedPatient.prescriptions || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.prescriptions?.map((prescription) => (
                      <Item key={prescription.id} title={prescription.status} subtitle={formatDateTime(prescription.prescribingDate)} text={prescription.instruction || prescription.lineItems?.map((line) => [line.dosage, line.frequency, line.notes].filter(Boolean).join(" - ")).join(", ") || "Prescription sans detail."} />
                    ))
                  )}
                </Panel>

                <Panel title="Examens laboratoire">
                  {(selectedPatient.labRequests || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.labRequests?.map((request) => (
                      <Item key={request.id} title={request.specimenType || request.status} subtitle={formatDateTime(request.requestedAt)} text={request.results?.map((result) => `${result.resultName}: ${result.resultValue} ${result.units || ""}`).join(", ") || "Resultat en attente."} />
                    ))
                  )}
                </Panel>

                <Panel title="Imagerie">
                  {(selectedPatient.imagingRequests || []).length === 0 ? (
                    <Empty />
                  ) : (
                    selectedPatient.imagingRequests?.map((request) => (
                      <Item key={request.id} title={`${request.modality} - ${request.bodyPart}`} subtitle={formatDateTime(request.createdAt)} text={request.report?.impression || request.status} />
                    ))
                  )}
                </Panel>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "blue" | "red" | "green" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    blue: "text-blue-700 dark:text-blue-300",
    red: "text-red-700 dark:text-red-300",
    green: "text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function Item({ title, subtitle, text }: { title: string; subtitle: string; text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
      <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      <p className="mt-2 text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  );
}

function Empty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}
