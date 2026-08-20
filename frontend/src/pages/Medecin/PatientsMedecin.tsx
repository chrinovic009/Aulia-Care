import { useEffect, useMemo, useState } from "react";
import PageMeta from "../../components/common/PageMeta";
import { apiFetch } from "../../config/api";
import {
  DoctorPatient,
  fetchDoctorVisiblePatientsPage,
  formatDoctorPatientName,
} from "../../api/doctor";
import { fetchLaboratoryCatalogue } from "../../api/laboratory";
import { formatConsultationId, formatDossierId, formatExamRequestId, formatPrescriptionId } from "../../utils/formatId";
import { medicalHistoryKindLabel } from "../../utils/medicalHistoryLabels";
import { calculateBmi } from "../../utils/vitals";

type LabTestMetadata = {
  id: string;
  name: string;
  price?: string;
  section?: { name: string } | null;
  category?: { name: string } | null;
  referenceRange?: string | null;
};

type Department = {
  id: string;
  name: string;
  isParamedical?: boolean;
};


const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const isNfsExam = (name?: string | null) =>
  Boolean(/(^|\s)(nfs|h[eé]mogramme|num[eé]ration formule sanguine)(\s|$)/i.test(name || ""));

const formatLabResultParameter = (parameter: any) => {
  const name = parameter.labTestParameter?.name || "Paramètre";
  const value = parameter.valueNumeric?.toString() || parameter.valueText || "-";
  const unit = parameter.labTestParameter?.unit ? ` ${parameter.labTestParameter.unit}` : "";
  const reference = parameter.labTestParameter?.referenceRange ? ` | Référence : ${parameter.labTestParameter.referenceRange}` : "";
  const interpretation = parameter.interpretation ? ` | Interprétation : ${parameter.interpretation}` : "";
  return `${name}: ${value}${unit}${reference}${interpretation}`;
};

const serviceLabel = (patient: DoctorPatient) =>
  typeof patient.service === "string" ? patient.service : patient.service?.name || "Service non renseigne";

const doctorLabel = (doctor?: DoctorPatient["assignedDoctor"] | null) =>
  doctor?.displayName || [doctor?.firstName, doctor?.lastName].filter(Boolean).join(" ") || "Aucun medecin";

const parseClinicalSummary = (value?: string | Record<string, unknown> | null) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === "object" && parsed ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const getPatientConsultations = (patient: DoctorPatient) => {
  const consultations = patient.consultations?.length ? patient.consultations : [];
  const historicalConsultations = (patient.medicalHistories || [])
    .filter((item) => item.kind === "MEDICAL_CONSULTATION")
    .map((item, index) => {
      const parsed = parseClinicalSummary(item.details);
      const parsedObject = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      const diagnosis = parsedObject && typeof parsedObject.diagnosis === "object" && parsedObject.diagnosis
        ? (parsedObject.diagnosis as Record<string, unknown>).description || (parsedObject.diagnosis as Record<string, unknown>).principal || null
        : null;
      const chiefComplaint = parsedObject && typeof parsedObject.currentSymptoms === "object" && parsedObject.currentSymptoms
        ? ((parsedObject.currentSymptoms as Record<string, unknown>).onset as string | undefined) || ((parsedObject.currentSymptoms as Record<string, unknown>).painLocation as string | undefined) || "Consultation médicale"
        : "Consultation médicale";

      return {
        id: typeof parsedObject?.consultationId === "string" ? parsedObject.consultationId : (item.id || `${patient.id}-history-${index}`),
        status: "FINALIZED",
        chiefComplaint,
        clinicalSummary: item.details,
        diagnosis: diagnosis || undefined,
        createdAt: item.eventDate,
        provider: item.createdBy
          ? {
              id: `${patient.id}-history-${index}`,
              displayName: item.createdBy.displayName || "Médecin",
              firstName: undefined,
              lastName: undefined,
              specialty: item.createdBy.primaryRole || undefined,
            }
          : null,
      } as NonNullable<DoctorPatient["consultations"]>[number];
    });
  // A clinical save creates an auditable MedicalHistory entry as well as updating
  // the Consultation record.  Do not render the same consultation twice simply
  // because it was saved several times during the encounter.
  const consultationIds = new Set(consultations.map((consultation) => consultation.id));
  const merged = [
    ...consultations,
    ...historicalConsultations.filter((consultation) => !consultationIds.has(consultation.id)),
  ];
  if (merged.length > 0) return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return patient.latestConsultation ? [patient.latestConsultation as NonNullable<DoctorPatient["consultations"]>[number]] : [];
};

const collectClinicalText = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const pieces = value.map((entry) => collectClinicalText(entry)).filter(Boolean) as string[];
    return pieces.length ? pieces.join(" | ") : null;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([, entryValue]) => collectClinicalText(entryValue))
      .filter(Boolean) as string[];
    return entries.length ? entries.join(" | ") : null;
  }
  return null;
};

const latestVital = (patient: DoctorPatient, type: string) =>
  patient.vitalSigns?.find((vital) => vital.type === type);

export default function PatientsMedecin() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [page, setPage] = useState(1);
  const [totalPatients, setTotalPatients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [labTests, setLabTests] = useState<LabTestMetadata[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "WRITE" | "READ_ONLY">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDoctorVisiblePatientsPage(page, 10);
      setPatients(data.items);
      setTotalPatients(data.total);
      setTotalPages(data.totalPages);
      setSelectedPatientId((current) => data.items.some((patient) => patient.id === current) ? current : data.items[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les dossiers patients.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadLabTests = async () => {
    try {
      const catalogue = await fetchLaboratoryCatalogue();
      setLabTests(catalogue.tests || []);
    } catch {
      setLabTests([]);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await apiFetch<Department[]>('/administration/departments');
      setDepartments(data || []);
    } catch {
      setDepartments([]);
    }
  };

  useEffect(() => {
    loadPatients();
    loadLabTests();
    loadDepartments();
    const handler = () => {
      loadPatients();
      loadLabTests();
      loadDepartments();
    };
    window.addEventListener("aulia:patient.updated", handler);
    window.addEventListener("aulia:consultation.created", handler);
    window.addEventListener("aulia:clinicalDataUpdated", handler);
    window.addEventListener("aulia:lab.request.created", handler);
    window.addEventListener("aulia:lab.result.created", handler);
    return () => {
      window.removeEventListener("aulia:patient.updated", handler);
      window.removeEventListener("aulia:consultation.created", handler);
      window.removeEventListener("aulia:clinicalDataUpdated", handler);
      window.removeEventListener("aulia:lab.request.created", handler);
      window.removeEventListener("aulia:lab.result.created", handler);
    };
  }, [page]);

  const filteredPatients = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return patients.filter((patient) => {
      const matchesFilter = filter === "ALL" || patient.access?.mode === filter;
      const haystack = [
        formatDoctorPatientName(patient),
        patient.phone,
        patient.email,
        serviceLabel(patient),
        patient.workflowStatus,
        patient.hasPendingAppointmentWithoutConsultation ? 'Non reçu' : null,
        doctorLabel(patient.assignedDoctor),
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesFilter && (!normalized || haystack.includes(normalized));
    });
  }, [patients, search, filter]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || filteredPatients[0] || null;
  const selectedPatientPosition = selectedPatient ? patients.findIndex((patient) => patient.id === selectedPatient.id) + 1 : undefined;

  const metrics = useMemo(() => ({
    total: totalPatients,
    write: patients.filter((patient) => patient.access?.canWrite).length,
    readonly: patients.filter((patient) => !patient.access?.canWrite).length,
    urgent: patients.filter((patient) => ["urgent", "urgence", "prioritaire", "critical"].includes((patient.priority || "").toLowerCase())).length,
  }), [patients, totalPatients]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <PageMeta title="Patients medecin | Aulia Care" description="Dossiers patients visibles par les medecins." />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Dossiers partages</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Visibilité patient</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Tous les medecins voient les dossiers. L'ecriture est reservee au medecin assigne ou au remplacant autorise par le shift.
            </p>
          </div>
          <button onClick={loadPatients} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
            Actualiser
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Metric label="Dossiers visibles" value={metrics.total} />
          <Metric label="Ecriture autorisee" value={metrics.write} tone="green" />
          <Metric label="Lecture seule" value={metrics.readonly} tone="blue" />
          <Metric label="Prioritaires" value={metrics.urgent} tone="red" />
        </div>
      </section>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-5 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          <div className="grid gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher nom, service, medecin..."
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <div className="grid grid-cols-3 gap-2">
              {[
                ["ALL", "Tous"],
                ["WRITE", "Ecriture"],
                ["READ_ONLY", "Lecture"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key as typeof filter)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                    filter === key
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              <p className="text-sm text-slate-500">Chargement...</p>
            ) : filteredPatients.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun dossier trouve.</p>
            ) : filteredPatients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => setSelectedPatientId(patient.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedPatient?.id === patient.id
                    ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40"
                    : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</p>
                    <p className="mt-1 text-xs text-slate-500">{serviceLabel(patient)}</p>
                    <p className="mt-1 text-xs text-slate-500">Envoye vers: {doctorLabel(patient.assignedDoctor)}</p>
                    {patient.hasPendingAppointmentWithoutConsultation ? (
                      <span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Non reçu</span>
                    ) : null}
                  </div>
                  <AccessBadge access={patient.access} />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>Page {page} / {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || isLoading} className="rounded-lg border border-slate-200 px-2.5 py-2 font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">Préc.</button>
              <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || isLoading} className="rounded-lg border border-slate-200 px-2.5 py-2 font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800">Suiv.</button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          {!selectedPatient ? (
            <p className="text-sm text-slate-500">Selectionnez un patient.</p>
          ) : (
            <PatientRecord patient={selectedPatient} position={selectedPatientPosition} labTests={labTests} departments={departments} />
          )}
        </main>
      </div>
    </div>
  );
}

function PatientRecord({ patient, position, labTests, departments }: { patient: DoctorPatient; position?: number; labTests: LabTestMetadata[]; departments: Department[] }) {
  const [detailPage, setDetailPage] = useState(1);
  const [consultationsPage, setConsultationsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [labPage, setLabPage] = useState(1);
  const [prescriptionsPage, setPrescriptionsPage] = useState(1);
  const [hospitalizationsPage, setHospitalizationsPage] = useState(1);
  const consultations = getPatientConsultations(patient);
  const history = patient.medicalHistories || [];
  const labRequests = patient.labRequests || [];
  const prescriptions = patient.prescriptions || [];
  const hospitalizations = patient.hospitalizations || [];

  useEffect(() => {
    setDetailPage(1);
    setConsultationsPage(1);
    setHistoryPage(1);
    setLabPage(1);
    setPrescriptionsPage(1);
    setHospitalizationsPage(1);
  }, [patient.id]);

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-6 shadow-sm ring-1 ring-slate-200/70 dark:border-slate-800 dark:bg-slate-950 dark:ring-slate-700/60">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="inline-flex rounded-full bg-blue-100 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
              Dossier Patient
            </div>
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                {serviceLabel(patient)} · {doctorLabel(patient.assignedDoctor)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={patient.hasPendingAppointmentWithoutConsultation ? 'Non reçu' : patient.workflowStatus || "Statut inconnu"} />
              <AccessBadge access={patient.access} />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {patient.priority ? `Priorité : ${patient.priority}` : "Priorité normale"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:auto-rows-min">
            <button
              type="button"
              onClick={() => void printPatientRecord(patient, position, labTests, departments)}
              className="rounded-3xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:border-slate-600 dark:hover:bg-slate-900"
            >
              🖨️ Imprimer le dossier
            </button>
            <div className="rounded-3xl border border-slate-200 bg-white/90 px-5 py-4 text-sm dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Accès</p>
              <p className="mt-2 font-semibold text-slate-900 dark:text-white">
                {patient.access?.canWrite ? "Modification autorisée" : "Lecture seule"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <QuickStat label="ID dossier" value={formatDossierId(position || 1, patient)} />
          <QuickStat label="Né le" value={patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "-"} />
          <QuickStat label="Sexe" value={patient.gender || "-"} />
          <QuickStat label="Groupe sanguin" value={patient.bloodType || "-"} />
          <QuickStat label="Téléphone" value={patient.phone || "-"} />
          <QuickStat label="Email" value={patient.email || "-"} />
          <QuickStat label="Adresse" value={patient.address || "-"} />
          <QuickStat label="Profession" value={patient.profession || "-"} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aulia-teal">Lecture du dossier</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{detailPage === 1 ? 'Synthèse clinique et dernières consultations' : 'Parcours, examens, prescriptions et hospitalisations'}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => setDetailPage(1)} className={`rounded-xl px-3 py-2 font-semibold transition ${detailPage === 1 ? 'bg-aulia-navy text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>1 · Synthèse</button>
          <button type="button" onClick={() => setDetailPage(2)} className={`rounded-xl px-3 py-2 font-semibold transition ${detailPage === 2 ? 'bg-aulia-navy text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>2 · Parcours</button>
        </div>
      </div>

      {detailPage === 1 ? <div className="space-y-6">
        <Section title="Signes vitaux">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["Température", "TEMPERATURE"],
              ["Tension", "BLOOD_PRESSURE"],
              ["SpO2", "OXYGEN_SATURATION"],
              ["Pouls", "HEART_RATE"],
              ["Respiration", "RESPIRATORY_RATE"],
              ["Poids", "WEIGHT"],
              ["Taille", "HEIGHT"],
              ["IMC", "__BMI__"],
              ["P. thoracique", "CHEST_CIRCUMFERENCE"],
              ["P. brachial", "ARM_CIRCUMFERENCE"],
            ].map(([label, type]) => {
              const vital = latestVital(patient, type);
              const reading = type === "__BMI__" ? calculateBmi(patient.vitalSigns) || "-" : vital ? `${vital.value} ${vital.unit || ""}`.trim() : "-";
              return <Info key={type} label={label} value={reading} />;
            })}
          </div>
        </Section>

        <Section title="Contacts famille">
          {(patient.familyContacts || []).length === 0 ? <Empty /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {patient.familyContacts?.map((contact) => (
                <div key={contact.id || contact.name} className="rounded-3xl border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <p className="font-semibold text-slate-900 dark:text-white">{contact.name}</p>
                  <p className="mt-2 text-slate-500">{contact.relationship || "-"} · {contact.phone || "-"}</p>
                  <p className="mt-1 text-slate-500">{contact.address || contact.email || "-"}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Consultations récentes">
          {consultations.length === 0 ? <Empty /> : (
            <div className="space-y-3">
              {pageItems(consultations, consultationsPage, 3).map((consultation, index) => (
                <ClinicalConsultation key={consultation.id} consultation={consultation} displayId={formatConsultationId((consultationsPage - 1) * 3 + index + 1, patient)} />
              ))}
              <InlinePagination page={consultationsPage} total={consultations.length} pageSize={3} onChange={setConsultationsPage} label="consultations" />
            </div>
          )}
        </Section>
      </div> : <div className="space-y-4">
        <Section title="Historique médical">
          {history.length === 0 ? <Empty /> : <div className="space-y-3">
            {pageItems(history, historyPage, 4).map((item) => <HistoryEventCard key={item.id} item={item} patient={patient} labTests={labTests} departments={departments} />)}
            <InlinePagination page={historyPage} total={history.length} pageSize={4} onChange={setHistoryPage} label="événements" />
          </div>}
        </Section>
        <Section title="Examens laboratoire">
          {labRequests.length === 0 ? <Empty /> : <div className="space-y-3">{pageItems(labRequests, labPage, 4).map((request, index) => (
            <TimelineCard
              key={request.id}
              title={`${formatExamRequestId((labPage - 1) * 4 + index + 1, patient)} - ${request.specimenType || "Examen"}`}
              subtitle={`${request.status} - ${formatDate(request.requestedAt)}`}
              text={
                request.results?.length
                  ? request.results
                      .map((result) => `${result.resultName || "Résultat"}: ${result.resultValue?.trim() || "Non renseigné"}${result.units ? ` ${result.units}` : ""}`)
                      .join(", ")
                  : "Resultat en attente."
              }
            />
          ))}<InlinePagination page={labPage} total={labRequests.length} pageSize={4} onChange={setLabPage} label="examens" /></div>}
        </Section>

        <Section title="Prescriptions">
          {prescriptions.length === 0 ? <Empty /> : <div className="space-y-3">{pageItems(prescriptions, prescriptionsPage, 4).map((prescription, index) => (
            <TimelineCard
              key={prescription.id}
              title={`${formatPrescriptionId((prescriptionsPage - 1) * 4 + index + 1, patient)} - ${prescription.prescriber?.displayName || prescription.status}`}
              subtitle={formatDate(prescription.prescribingDate)}
              text={prescription.lineItems?.map((line) => `${line.medication?.name || "Medicament"} - ${line.dosage || ""} - ${line.frequency || ""} - qte ${line.quantity || 1}`).join(", ") || prescription.instruction || "-"}
            />
          ))}<InlinePagination page={prescriptionsPage} total={prescriptions.length} pageSize={4} onChange={setPrescriptionsPage} label="prescriptions" /></div>}
        </Section>

        <Section title="Hospitalisations">
          {hospitalizations.length === 0 ? <Empty /> : <div className="space-y-3">{pageItems(hospitalizations, hospitalizationsPage, 4).map((item) => (
            <TimelineCard
              key={item.id}
              title={`${item.status} ${item.bedNumber ? `- lit ${item.bedNumber}` : ""}`}
              subtitle={formatDate(item.admittedAt)}
              text={item.admissionReason || "Hospitalisation"}
            />
          ))}<InlinePagination page={hospitalizationsPage} total={hospitalizations.length} pageSize={4} onChange={setHospitalizationsPage} label="hospitalisations" /></div>}
        </Section>
      </div>}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
        {detailPage === 2 ? <button type="button" onClick={() => setDetailPage(1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700">Précédent</button> : null}
        {detailPage === 1 ? <button type="button" onClick={() => setDetailPage(2)} className="rounded-xl bg-aulia-navy px-4 py-2 text-sm font-semibold text-white">Suivant</button> : null}
      </div>
    </div>
  );
}

function pageItems<T>(items: T[], page: number, pageSize: number) {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

function InlinePagination({ page, total, pageSize, onChange, label }: { page: number; total: number; pageSize: number; onChange: (page: number) => void; label: string }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"><span>{total} {label} · page {page}/{totalPages}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => onChange(page - 1)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold disabled:opacity-40 dark:border-slate-700">Préc.</button><button type="button" disabled={page === totalPages} onClick={() => onChange(page + 1)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold disabled:opacity-40 dark:border-slate-700">Suiv.</button></div></div>;
}

function buildClinicalBulletList(lines: Array<{ label: string; value: string | null }>) {
  const visibleLines = lines.filter((line) => line.value && line.value.trim());
  if (!visibleLines.length) {
    return <span className="text-slate-500 dark:text-slate-400">Non renseigné</span>;
  }

  return (
    <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
      {visibleLines.map((line) => (
        <div key={line.label}>
          <span className="font-semibold text-slate-900 dark:text-white">{line.label} :</span>{" "}
          <span>{line.value}</span>
        </div>
      ))}
    </div>
  );
}

function buildAntecedentsLines(parsedObject: Record<string, any>) {
  const source = parsedObject.medicalHistory as Record<string, unknown> | null;
  const lines = [
    { label: "Maladies connues", value: normalizeClinicalValue(source?.knownDiseases || source?.diseases) },
    { label: "Chirurgies", value: normalizeClinicalValue(source?.surgeries) },
    { label: "Allergies", value: normalizeClinicalValue(source?.allergies) },
    { label: "Médicaments en cours", value: normalizeClinicalValue(source?.currentMedications) },
    { label: "Antécédents familiaux", value: normalizeClinicalValue(source?.familyHistory) },
    { label: "Résumé", value: normalizeClinicalValue(source?.description) },
  ];
  return lines;
}

function buildAnamnesisLines(parsedObject: Record<string, any>) {
  const source = parsedObject.currentSymptoms as Record<string, unknown> | null;
  const lines = [
    { label: "Début", value: normalizeClinicalValue(source?.onset) },
    { label: "Localisation", value: normalizeClinicalValue(source?.painLocation) },
    { label: "Intensité", value: normalizeClinicalValue(source?.intensity) },
    { label: "Facteurs aggravants", value: normalizeClinicalValue(source?.aggravatingFactors) },
    { label: "Symptômes associés", value: normalizeClinicalValue(source?.associatedSymptoms) },
    { label: "Description narrative", value: normalizeClinicalValue(source?.description) },
    { label: "Impact fonctionnel", value: normalizeClinicalValue(source?.functionalImpact || source?.functionalImpactDescription) },
  ];
  return lines;
}

function buildClinicalExamLines(parsedObject: Record<string, any>) {
  const examSource = parsedObject.clinicalExam as Record<string, unknown> | null;
  const medicationSummary = formatMedicationSummary(parsedObject.medicalHistory?.currentMedications || parsedObject.consultationModule?.currentMedications);
  const lines = [
    { label: "État général", value: normalizeClinicalValue(examSource?.generalState) },
    { label: "Auscultation", value: normalizeClinicalValue(examSource?.auscultation) },
    { label: "Palpation", value: normalizeClinicalValue(examSource?.palpation) },
    { label: "Examen ciblé", value: normalizeClinicalValue(examSource?.focusedExam) },
    { label: "Médicaments en cours", value: medicationSummary },
    { label: "Résumé", value: normalizeClinicalValue(examSource?.description) },
  ];
  return lines;
}

function buildDiagnosticLines(parsedObject: Record<string, any>, consultation: NonNullable<DoctorPatient["consultations"]>[number]) {
  const diagnosisSource = parsedObject.diagnosis as Record<string, unknown> | null;
  const complementaryExams = formatComplementaryExamSummary(parsedObject.complementaryExams || parsedObject.consultationModule?.orderedExams);
  const diagnosisText = normalizeClinicalValue(diagnosisSource?.description || diagnosisSource?.principal || consultation.diagnosis);
  const hypotheses = normalizeClinicalValue(Array.isArray(diagnosisSource?.hypotheses) ? diagnosisSource.hypotheses : null);
  const lines = [
    { label: "Diagnostic principal", value: diagnosisText },
    { label: "Hypothèses", value: hypotheses },
    { label: "Examens complémentaires", value: complementaryExams },
  ];
  return lines;
}

function buildFollowUpLines(parsedObject: Record<string, any>) {
  const treatmentPlan = parsedObject.treatmentPlan as Record<string, unknown> | null;
  const followUp = parsedObject.followUp as Record<string, unknown> | null;
  const consultationModule = parsedObject.consultationModule as Record<string, any> | null;
  const lines = [
    { label: "Consignes", value: normalizeClinicalValue(treatmentPlan?.notes || treatmentPlan?.description || treatmentPlan?.safetyConsignes || consultationModule?.safetyConsignes) },
    { label: "Arrêt de travail", value: consultationModule?.sickLeave && typeof consultationModule.sickLeave === "object"
      ? `Oui${consultationModule.sickLeave.durationDays ? ` (${consultationModule.sickLeave.durationDays} jours)` : ""}`
      : null },
    { label: "Suivi", value: normalizeClinicalValue([consultationModule?.followUp?.recommendedInterval, consultationModule?.followUp?.specificDate, followUp?.notes || followUp?.description || followUp?.recommendedInterval || followUp?.specificDate].filter(Boolean).join(" | ")) },
  ];
  return lines;
}

function normalizeClinicalValue(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const parts = value.map((item) => normalizeClinicalValue(item)).filter(Boolean) as string[];
    return parts.length ? parts.join(" | ") : null;
  }
  if (typeof value === "object") {
    const text = collectClinicalText(value);
    return text || null;
  }
  return String(value);
}

function ClinicalConsultation({ consultation, displayId }: { consultation: NonNullable<DoctorPatient["consultations"]>[number]; displayId: string }) {
  const parsed = parseClinicalSummary(consultation.clinicalSummary as any);

  const renderClinicalSection = () => {
    const parsedText = collectClinicalText(parsed) || collectClinicalText((consultation as Record<string, unknown>).assessment) || collectClinicalText((consultation as Record<string, unknown>).plan);
    const fallbackText = [
      typeof consultation.clinicalSummary === "string" ? consultation.clinicalSummary : null,
      parsedText,
      consultation.diagnosis,
      consultation.chiefComplaint,
      collectClinicalText((consultation as Record<string, unknown>).assessment),
      collectClinicalText((consultation as Record<string, unknown>).plan),
    ].filter(Boolean).join(" | ");

    if (!parsed || typeof parsed !== "object") {
      return <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{fallbackText || "Aucune note clinique."}</p>;
    }

    const parsedObject = parsed as Record<string, any>;
    const antecedents = buildClinicalBulletList(buildAntecedentsLines(parsedObject));
    const anamnese = buildClinicalBulletList(buildAnamnesisLines(parsedObject));
    const examClinical = buildClinicalBulletList(buildClinicalExamLines(parsedObject));
    const diagnostic = buildClinicalBulletList(buildDiagnosticLines(parsedObject, consultation));
    const followUp = buildClinicalBulletList(buildFollowUpLines(parsedObject));

    return (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Info label="Antécédents" value={antecedents} />
        <Info label="Anamnèse" value={anamnese} />
        <Info label="Examen clinique" value={examClinical} />
        <Info label="Diagnostic" value={diagnostic} />
        <Info label="Consignes & Suivi" value={followUp} />
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{displayId} - {consultation.chiefComplaint || "Consultation médicale"}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(consultation.createdAt)} - {consultation.provider?.displayName || "Médecin"}</p>
        </div>
        <StatusBadge label={consultation.status} />
      </div>

      {renderClinicalSection()}
    </div>
  );
}

function formatMedicationSummary(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const formatted = value.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const entry = item as Record<string, unknown>;
        const name = [entry.drugName, entry.name, entry.medicationName].filter(Boolean).join(" ");
        const dosage = [entry.dosage, entry.strength, entry.dose].filter(Boolean).join(" ");
        const compliance = entry.compliance ? `• ${entry.compliance}` : "";
        return [name, dosage, compliance].filter(Boolean).join(" ").trim();
      }
      return null;
    }).filter(Boolean);
    return formatted.length ? `Médicaments en cours: ${formatted.join(" | ")}` : null;
  }
  if (typeof value === "string") return value.trim() ? `Médicaments en cours: ${value.trim()}` : null;
  return null;
}

function formatComplementaryExamSummary(value: unknown) {
  if (!value) return null;
  if (Array.isArray(value)) {
    const formatted = value.map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const entry = item as Record<string, unknown>;
        return [entry.testName, entry.name, entry.category].filter(Boolean).join(" ");
      }
      return null;
    }).filter(Boolean);
    return formatted.length ? `Examens complémentaires: ${formatted.join(" | ")}` : null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const ordered = Array.isArray(record.orderedExams) ? record.orderedExams : [];
    if (ordered.length) {
      const formatted = ordered.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const entry = item as Record<string, unknown>;
          return [entry.testName, entry.name, entry.category].filter(Boolean).join(" ");
        }
        return null;
      }).filter(Boolean);
      return formatted.length ? `Examens complémentaires: ${formatted.join(" | ")}` : null;
    }
  }
  if (typeof value === "string") return value.trim() ? `Examens complémentaires: ${value.trim()}` : null;
  return null;
}

function formatFollowUpSummary(parsedObject: Record<string, any>) {
  const treatmentPlan = parsedObject.treatmentPlan as Record<string, unknown> | null;
  const followUp = parsedObject.followUp as Record<string, unknown> | null;
  const consultationModule = parsedObject.consultationModule as Record<string, any> | null;
  const parts = [
    collectClinicalText(treatmentPlan?.notes || treatmentPlan?.description || treatmentPlan?.safetyConsignes),
    collectClinicalText(consultationModule?.safetyConsignes),
    consultationModule?.sickLeave && typeof consultationModule.sickLeave === "object"
      ? `Arrêt de travail: ${consultationModule.sickLeave.active ? "oui" : "non"}${consultationModule.sickLeave.durationDays ? ` (${consultationModule.sickLeave.durationDays} jours)` : ""}`
      : null,
    [collectClinicalText(consultationModule?.followUp?.recommendedInterval), collectClinicalText(consultationModule?.followUp?.specificDate)].filter(Boolean).join(" | "),
    collectClinicalText(followUp?.notes || followUp?.description || followUp?.recommendedInterval || followUp?.specificDate),
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : null;
}

function HistoryEventCard({ item, patient, labTests, departments }: { item: NonNullable<DoctorPatient["medicalHistories"]>[number]; patient: DoctorPatient; labTests: LabTestMetadata[]; departments: Department[] }) {
  const title = historyTitle(item.kind);
  const parsed = parseHistoryDetails(item.details);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(item.eventDate)} - {item.createdBy?.displayName || "Systeme"}</p>
        </div>
        <StatusBadge label={getHistoryBadgeLabel(item.kind, parsed, patient)} />
      </div>
      <div className="mt-4">{renderHistoryDetails(item.kind, parsed, patient, labTests, departments)}</div>
    </div>
  );
}

function historyTitle(kind: string) {
  return medicalHistoryKindLabel(kind);
}

function getHistoryBadgeLabel(kind: string, parsed: any, patient: DoctorPatient) {
  if (kind === "LAB_REQUEST") {
    const labRequest = parsed?.labRequestId ? patient.labRequests?.find((request) => request.id === parsed.labRequestId) : undefined;
    if (!labRequest) return medicalHistoryKindLabel(kind);

    const hasResults = Boolean(labRequest.results?.some((result) => result.resultValue?.trim()));
    const status = labRequest.status?.toString().toUpperCase();

    if (hasResults || ["AVAILABLE", "SENT", "VERIFIED", "COMPLETED"].includes(status || "")) {
      return "Résultat disponible";
    }
    if (status === "REQUESTED" || status === "PENDING" || status === "AWAITING_PAYMENT") {
      return "En attente de paiement";
    }
    return "En cours de traitement";
  }

  if (kind === "PRESCRIPTION_CREATED") {
    const prescription = parsed?.prescriptionId ? patient.prescriptions?.find((item) => item.id === parsed.prescriptionId) : undefined;
    if (!prescription) return medicalHistoryKindLabel(kind);

    const status = prescription.status?.toString().toUpperCase();
    if (status === "DISPENSED") return "Dispensé";
    if (status === "PRESCRIBED" || status === "ACTIVE" || status === "ISSUED") return "En attente de dispensation";
    return "En attente de paiement";
  }

  return medicalHistoryKindLabel(kind);
}

function parseHistoryDetails(details: string) {
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed !== "object" || !parsed) return null;
    return parsed;
  } catch {
    return null;
  }
}

function renderHistoryDetails(kind: string, parsed: any, patient: DoctorPatient, labTests: LabTestMetadata[], departments: Department[]) {
  if (!parsed || typeof parsed !== "object") {
    return <p className="text-slate-600 dark:text-slate-300">{String(parsed || "-")}</p>;
  }

  if (kind === "MEDICAL_CONSULTATION") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Info label="Antecedents" value={joinValues(parsed.medicalHistory, ["knownDiseases", "surgeries", "allergies", "currentMedications", "familyHistory"])} />
        <Info label="Anamnese" value={joinValues(parsed.currentSymptoms, ["onset", "painLocation", "intensity", "aggravatingFactors", "associatedSymptoms"])} />
        <Info label="Examen clinique" value={joinValues(parsed.clinicalExam, ["generalState", "auscultation", "palpation", "focusedExam"])} />
        <Info label="Diagnostic" value={[parsed.diagnosis?.principal, ...(parsed.diagnosis?.hypotheses || [])].filter(Boolean).join(" | ") || "-"} />
        <Info label="Consignes & Suivi" value={[parsed.treatmentPlan?.notes, parsed.followUp?.notes].filter(Boolean).join(" | ") || "-"} />
      </div>
    );
  }

  if (kind === "LAB_REQUEST") {
    const labRequest = parsed?.labRequestId ? patient.labRequests?.find((request) => request.id === parsed.labRequestId) : undefined;
    const labTest = labRequest
      ? labTests.find((test) => test.id === labRequest.labTestId || test.id === (labRequest.labTest && (labRequest.labTest.id || labRequest.labTestId)) || test.name === labRequest.specimenType || test.name === labRequest.examName)
      : undefined;
    const examName = labRequest?.specimenType || labRequest?.examName || labTest?.name || "-";
    const department = (labRequest?.departmentId && departments.find((dept) => String(dept.id) === String(labRequest.departmentId))?.name)
      || labRequest?.departmentName
      || labTest?.section?.name
      || labTest?.category?.name
      || "-";
    const price = labRequest?.price ?? labRequest?.charge ?? labRequest?.chargeAmount ?? labTest?.price ?? null;
    const results = labRequest?.results || [];
    const firstResult = results[0];
    const delayValue = labRequest ? getLabDelay({ requestedAt: labRequest.requestedAt, receivedAt: firstResult?.reportedAt || firstResult?.createdAt || labRequest.completedAt }) : "-";
    const isNfsRequest = isNfsExam(examName);
    const nfsParameters = Array.isArray(firstResult?.parameters) ? firstResult.parameters : [];

    if (isNfsRequest) {
      return (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Info label="Nom de l'examen" value={examName} />
            <Info label="Département" value={department} />
            <Info label="Prix de l'examen" value={formatCurrencyValue(price)} />
            <Info label="Délai" value={delayValue} />
          </div>
          {nfsParameters.length > 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="font-semibold text-slate-900 dark:text-white">Resultats</p>
              <div className="mt-4 space-y-3">
                {nfsParameters.map((parameter: any, index: number) => (
                  <div key={`nfs-param-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{parameter.labTestParameter?.name || "Paramètre"}</p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                      Valeur: {parameter.valueNumeric?.toString() || parameter.valueText || "-"}{parameter.labTestParameter?.unit ? ` ${parameter.labTestParameter.unit}` : ""}
                    </p>
                    {parameter.labTestParameter?.referenceRange ? <p className="mt-1 text-slate-600 dark:text-slate-300">Référence: {parameter.labTestParameter.referenceRange}</p> : null}
                    {parameter.interpretation ? <p className="mt-1 text-slate-600 dark:text-slate-300">Interprétation: {parameter.interpretation}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      );
    }

    const resultValue = results.length > 0 ? results.map((result: any) => `${result.resultName || "Résultat"}: ${result.resultValue || "-"}${result.units ? ` ${result.units}` : ""}`).join(" | ") : "-";
    const referenceValue = firstResult?.referenceRange || firstResult?.reference || firstResult?.reference_range || labTest?.referenceRange || labTest?.referenceRangeText || "-";
    const interpretation = firstResult?.interpretation || firstResult?.notes || labRequest?.interpretation || "-";

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Info label="Nom de l'examen" value={examName} />
        <Info label="Département" value={department} />
        <Info label="Prix de l'examen" value={formatCurrencyValue(price)} />
        <Info label="Résultat" value={resultValue} />
        <Info label="Valeur de référence" value={referenceValue} />
        <Info label="Délai" value={delayValue} />
        <Info label="Interprétation" value={interpretation} />
      </div>
    );
  }

  if (kind === "PRESCRIPTION_CREATED") {
    const prescription = parsed?.prescriptionId ? patient.prescriptions?.find((item) => item.id === parsed.prescriptionId) : undefined;
    const medicationName = prescription?.lineItems?.map((item) => item.medication?.name || "Médicament").filter(Boolean).join(" | ") || "-";
    const route = prescription?.lineItems?.map((item) => item.route || item.routeOfAdministration || item.voie || "").filter(Boolean).join(" | ") || "-";
    const dosage = prescription?.lineItems?.map((item) => item.dosage || item.strength || "").filter(Boolean).join(" | ") || "-";
    const quantity = prescription?.lineItems?.map((item) => item.quantity != null ? String(item.quantity) : "").filter(Boolean).join(" | ") || "-";
    const frequency = prescription?.lineItems?.map((item) => item.frequency || "").filter(Boolean).join(" | ") || "-";
    const duration = prescription?.lineItems?.map((item: any) => item.durationDays ? `${item.durationDays} jour${item.durationDays > 1 ? 's' : ''}` : item.duration || "").filter(Boolean).join(" | ") || "-";
    const advice = prescription?.lineItems?.map((item) => item.notes || item.instruction || "").filter(Boolean).join(" | ") || prescription?.instruction || "-";

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Info label="Nom du médicament" value={medicationName} />
        <Info label="Voie" value={route} />
        <Info label="Posologie" value={dosage} />
        <Info label="Quantité" value={quantity} />
        <Info label="Fréquence" value={frequency} />
        <Info label="Durée" value={duration} />
        <Info label="Conseil" value={advice} />
      </div>
    );
  }

  if (kind === "NURSE_ORIENTATION") {
    const consultation = parsed?.consultationId ? patient.consultations?.find((item) => item.id === parsed.consultationId) : undefined;
    const consultationValue = consultation?.chiefComplaint || consultation?.status || parsed.consultationName || parsed.consultationTitle || "-";
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="Medecin oriente" value={parsed.physicianName || parsed.physicianId || "-"} />
        <Info label="Consultation créée" value={consultationValue} />
        <Info label="Observation infirmière" value={parsed.notes || "-"} />
      </div>
    );
  }

  if (kind === "ADMISSION_METADATA") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="Date de naissance" value={parsed.dateOfBirth || "-"} />
        <Info label="Age" value={parsed.age ? `${parsed.age} ans` : "-"} />
        <Info label="Profession" value={parsed.profession || "-"} />
        <Info label="Receptionniste" value={parsed.receptionistName || "-"} />
        <Info label="Contacts famille" value={Array.isArray(parsed.familyContacts) && parsed.familyContacts.length ? parsed.familyContacts.map((contact: any) => `${contact.name || "-"} (${contact.relation || "-"}) ${contact.phone || ""}`).join(" | ") : "-"} />
      </div>
    );
  }

  if (kind === "NOUVELLE_VISITE") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="Service oriente" value={parsed.serviceName || "-"} />
        <Info label="Date prevue" value={parsed.scheduledAt ? new Date(parsed.scheduledAt).toLocaleString("fr-FR") : "-"} />
        <Info label="Motif" value={parsed.reason || "-"} />
        <Info label="Statut parcours" value={medicalHistoryKindLabel(parsed.workflowStatus) || parsed.workflowStatus || "-"} />
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(parsed)
        .filter(([, value]) => value !== null && value !== "" && value !== undefined)
        .map(([key, value]) => (
          <Info key={key} label={humanizeKey(key)} value={typeof value === "object" ? formatObjectValue(value) : String(value)} />
        ))}
    </div>
  );
}

function humanizeKey(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function formatObjectValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "object" ? Object.values(item as Record<string, unknown>).filter(Boolean).join(" ") : String(item)).join(" | ") || "-";
  }
  if (typeof value === "object" && value) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== "" && entryValue !== undefined)
      .map(([key, entryValue]) => `${humanizeKey(key)}: ${String(entryValue)}`)
      .join(" | ") || "-";
  }
  return String(value || "-");
}

function joinValues(source: any, keys: string[]) {
  if (!source) return "-";
  return keys.map((key) => source[key]).filter(Boolean).join(" | ") || "-";
}

function formatCurrencyValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return `${value} CDF`;
  return String(value);
}

function msToHuman(ms: number) {
  if (ms <= 0) return "0s";
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}j ${hours % 24}h`;
}

function getLabDelay({ requestedAt, receivedAt }: { requestedAt?: string | null; receivedAt?: string | null }) {
  if (!requestedAt || !receivedAt) return "-";
  const start = new Date(requestedAt).getTime();
  const end = new Date(receivedAt).getTime();
  if (!start || !end || end <= start) return "-";
  const ms = end - start;
  return msToHuman(ms);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "blue" | "red" }) {
  const colors = {
    default: "text-slate-900 dark:text-white",
    green: "text-emerald-700 dark:text-emerald-300",
    blue: "text-blue-700 dark:text-blue-300",
    red: "text-red-700 dark:text-red-300",
  };
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p></div>;
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition duration-150 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-sm leading-5 text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

async function printPatientRecord(patient: DoctorPatient, position?: number, labTests: LabTestMetadata[] = [], departments: Department[] = []) {
    const clinic = await apiFetch<{ name?: string; brandDisplayName?: string | null; documentLogoUrl?: string | null; address?: string | null; city?: string | null; country?: string | null; phone?: string | null; email?: string | null; rccmNumber?: string | null; taxNumber?: string | null; nationalIdNumber?: string | null; documentFooter?: string | null }>("/administration/clinic-branding").catch(() => ({}));
    const clinicName = clinic.brandDisplayName || clinic.name || "Aulia Care";
    const clinicContact = [[clinic.address, clinic.city, clinic.country].filter(Boolean).join(", "), clinic.phone ? `Tél: ${clinic.phone}` : "", clinic.email ? `E-mail: ${clinic.email}` : ""].filter(Boolean).join(" | ") || "Coordonnées de l’établissement non renseignées";
    const legalReferences = [["RCCM", clinic.rccmNumber], ["NIF", clinic.taxNumber], ["ID", clinic.nationalIdNumber]].filter(([, value]) => Boolean(value)).map(([label, value]) => `${label}: ${value}`).join(" | ");
  const formatDateString = (value?: string | null) => {
    if (!value) return "—";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  };

  const familyRows = (patient.familyContacts || []).map((contact) => `
      <tr>
        <td>${contact.name || "—"}</td>
        <td>${contact.relationship || "—"}</td>
        <td>${contact.phone || "—"}</td>
      </tr>
    `).join("");

  const visibleConsultations = getPatientConsultations(patient);
  const consultationRows = visibleConsultations.map((consultation) => `
      <tr>
        <td>${formatDateString(consultation.createdAt)}</td>
        <td>${consultation.chiefComplaint || "Consultation medicale"}</td>
        <td>${consultation.provider?.displayName || "Medecin"}</td>
        <td>${consultation.diagnosis || "-"}</td>
      </tr>
    `).join("");

  const prescriptionRows = (patient.prescriptions || []).map((prescription) => `
      <tr>
        <td>${formatDateString(prescription.prescribingDate)}</td>
        <td>${prescription.prescriber?.displayName || "-"}</td>
        <td>${prescription.lineItems?.map((line) => `${line.medication?.name || "Medicament"} ${line.dosage || ""} ${line.frequency || ""}`).join(" | ") || prescription.instruction || "-"}</td>
        <td>${translatePrescriptionStatus(prescription.status)}</td>
      </tr>
    `).join("");

  const hospitalizationRows = (patient.hospitalizations || []).map((item) => `
      <tr>
        <td>${formatDateString(item.admittedAt)}</td>
        <td>${item.status || "-"}</td>
        <td>${item.admissionReason || "-"}</td>
        <td>${item.bedNumber || "-"}</td>
      </tr>
    `).join("");

  const historyKindLabel = (kind: string) => {
    return medicalHistoryKindLabel(kind);
  };

  const formatHistoryDetails = (kind: string, details: string) => {
    const parsed = (() => {
      try {
        return JSON.parse(details);
      } catch {
        return null;
      }
    })();

    if (!parsed || typeof parsed !== "object") {
      return details || "-";
    }

    const formatHistoryValue = (value: unknown): string => {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
  };

  const toLine = (label: string, value?: string | number | null) => {
    const formatted = formatHistoryValue(value);
    return formatted ? `<div><strong>${label} :</strong> ${formatted}</div>` : "";
  };

    if (kind === "MEDICAL_CONSULTATION") {
      const rows: string[] = [];
      if (parsed.diagnosis?.principal) rows.push(toLine("Diagnostic", parsed.diagnosis.principal));
      if (parsed.consultationModule?.orderedExams?.length) rows.push(toLine("Examens demandés", parsed.consultationModule.orderedExams.map((exam: any) => exam.testName).join(", ")));
      const consignesSuivi = [parsed.treatmentPlan?.notes, parsed.followUp?.notes].filter(Boolean).join(" | ");
      if (consignesSuivi) rows.push(toLine("Consignes & Suivi", consignesSuivi));
      if (parsed.clinicalExam?.generalState) rows.push(toLine("État général", parsed.clinicalExam.generalState));
      if (parsed.currentSymptoms?.onset) rows.push(toLine("Début des symptômes", parsed.currentSymptoms.onset));
      return rows.length > 0 ? rows.join("") : details || "-";
    }

    if (kind === "NURSE_ORIENTATION") {
      const rows: string[] = [];
      if (parsed.physicianName) rows.push(toLine("Médecin orienté", parsed.physicianName));
      if (parsed.consultationId) {
        const linked = (patient.consultations || []).find((c: any) => c.id === parsed.consultationId);
        if (linked) {
          rows.push(toLine("Consultation", `${linked.chiefComplaint || 'Consultation médicale'} - ${linked.provider?.displayName || 'Médecin' } (${formatDateString(linked.createdAt)})`));
        } else {
          rows.push(toLine("Consultation", "-"));
        }
      }
      if (parsed.notes) rows.push(toLine("Observations infirmières", parsed.notes));
      return rows.length > 0 ? rows.join("") : details || "-";
    }

    if (kind === "ADMISSION_METADATA") {
      const rows: string[] = [];
      if (parsed.dateOfBirth) rows.push(toLine("Date de naissance", parsed.dateOfBirth));
      if (parsed.age) rows.push(toLine("Âge", String(parsed.age)));
      if (parsed.profession) rows.push(toLine("Profession", parsed.profession));
      if (parsed.receptionistName) rows.push(toLine("Réceptionniste", parsed.receptionistName));
      if (Array.isArray(parsed.familyContacts) && parsed.familyContacts.length) {
        rows.push(`<div><strong>Contacts familiaux :</strong> ${parsed.familyContacts.map((contact: any) => `${contact.name || "-"} (${contact.relation || "-"}) ${contact.phone || ""}`).join(" • ")}</div>`);
      }
      return rows.length > 0 ? rows.join("") : details || "-";
    }

    if (kind === "NOUVELLE_VISITE") {
      const rows: string[] = [];
      if (parsed.serviceName) rows.push(toLine("Service oriente", parsed.serviceName));
      if (parsed.scheduledAt) rows.push(toLine("Date prevue", formatDateString(parsed.scheduledAt)));
      if (parsed.reason) rows.push(toLine("Motif", parsed.reason));
      if (parsed.workflowStatus) rows.push(toLine("Statut parcours", parsed.workflowStatus));
      return rows.length > 0 ? rows.join("") : details || "-";
    }

    return Object.entries(parsed)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => {
        const prettyKey = key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
        if (typeof value === "object") {
          return `<div><strong>${prettyKey} :</strong> ${JSON.stringify(value)}</div>`;
        }
        return `<div><strong>${prettyKey} :</strong> ${String(value)}</div>`;
      })
      .join("") || details || "-";
  };

    const medicalHistoryRows = (patient.medicalHistories || []).map((item) => `
      <tr>
        <td>${formatDateString(item.eventDate)}</td>
        <td>${historyKindLabel(item.kind)}</td>
        <td>${formatHistoryDetails(item.kind, item.details)}</td>
      </tr>
    `).join("");

    // Operations (extraction depuis medicalHistories pour bloc séparé)
    const operationItems = (patient.medicalHistories || []).filter((h) => h.kind === 'OPERATION');
    const operationsRows = operationItems.map((op) => `
      <tr>
        <td>${formatDateString(op.eventDate)}</td>
        <td>${op.details ? (() => {
          try { const p = JSON.parse(op.details); return p.procedureName || p.title || 'Opération'; } catch { return op.details || 'Opération'; }
        })() : 'Opération'}</td>
        <td>${formatHistoryDetails(op.kind, op.details)}</td>
      </tr>
    `).join("");

    // Lab requests detailed rows (includes date, price fallbacks, readable delay)
    const normalLabRows: string[] = [];
    const nfsLabRows: string[] = [];

    (patient.labRequests || []).forEach((request: any) => {
      const requestedAt = request.requestedAt ? new Date(request.requestedAt) : null;
      const firstResult = (request.results || [])[0];
      const resultReceivedAt = firstResult?.reportedAt || firstResult?.createdAt || request.completedAt || null;
      const dateCell = formatDateString(request.requestedAt || request.createdAt || request.createdAt);

      const delayMs = requestedAt && resultReceivedAt ? (new Date(resultReceivedAt).getTime() - requestedAt.getTime()) : null;
      const humanDelay = delayMs ? msToHuman(delayMs) : "-";
      const delayText = delayMs ? `${humanDelay} écoulé${humanDelay.startsWith('1') ? '' : 's'} depuis la demande jusqu'à la réception` : "-";

      const labTest = labTests.find((test) => test.id === request.labTestId || test.id === request.labTest?.id || test.name === request.specimenType);
      const examName = request.specimenType || labTest?.name || request.name || 'Examen';
      const departmentName = departments.find((dept) => dept.id === request.departmentId)?.name || labTest?.section?.name || labTest?.category?.name || request.departmentName || request.department || 'Laboratoire';
      const priceCandidate = labTest?.price || request.price || request.charge || request.chargeAmount;
      const priceDisplay = formatCurrencyValue(priceCandidate);

      const rVal = firstResult?.resultValue ?? firstResult?.value ?? firstResult?.result ?? "";
      const rUnitRaw = firstResult?.units || firstResult?.unit || firstResult?.u || "";
      const rUnit = rUnitRaw ? String(rUnitRaw).trim() : "";
      const rReferenceRaw = firstResult?.referenceRange || firstResult?.reference || firstResult?.reference_range || labTest?.referenceRange || "";
      let rReference = rReferenceRaw ? String(rReferenceRaw).trim() : "";
      if (rReference && rUnit && !rReference.toLowerCase().includes(rUnit.toLowerCase())) rReference = `${rReference} ${rUnit}`;
      const resultDisplay = rVal !== null && rVal !== undefined && String(rVal).trim() !== "" ? `${String(rVal).trim()}${rUnit ? ` ${rUnit}` : ""}` : "-";

      const interpretation = request.interpretation || firstResult?.interpretation || "-";
      const diagnostic = request.diagnostic || request.consultation?.diagnosis || "-";
      const isNfsRequest = isNfsExam(examName);
      const parameterRows = Array.isArray(firstResult?.parameters) ? firstResult.parameters.map((parameter: any, index: number) => {
        const paramName = parameter.labTestParameter?.name || 'Paramètre';
        const paramValue = parameter.valueNumeric?.toString() || parameter.valueText || '-';
        const paramUnit = parameter.labTestParameter?.unit ? ` ${parameter.labTestParameter.unit}` : '';
        const paramReference = parameter.labTestParameter?.referenceRange ? `Référence: ${parameter.labTestParameter.referenceRange}` : '';
        const paramInterpretation = parameter.interpretation ? `Interprétation: ${parameter.interpretation}` : '';
        return `
          <div style="margin-bottom: 8px;">
            <strong>${paramName}</strong><br/>
            Valeur: ${paramValue}${paramUnit}${paramReference ? `<br/>${paramReference}` : ''}${paramInterpretation ? `<br/>${paramInterpretation}` : ''}
          </div>
        `;
      }).join('') : [];

      if (isNfsRequest) {
        nfsLabRows.push(`
          <tr>
            <td>${dateCell}</td>
            <td>${request.specimenType || 'NFS'}</td>
            <td>${examName}</td>
            <td>${delayText}</td>
            <td>${priceDisplay}</td>
            <td>${parameterRows.length > 0 ? parameterRows : 'Aucun sous-examen disponible'}</td>
          </tr>
        `);
      } else {
        normalLabRows.push(`
          <tr>
            <td>${dateCell}</td>
            <td>${examName}</td>
            <td>${departmentName}</td>
            <td>${delayText}</td>
            <td>${priceDisplay}</td>
            <td>${resultDisplay}${rReference ? `<br/><small>valeur de référence: ${rReference}</small>` : ''}</td>
            <td>${interpretation}</td>
            <td>${diagnostic}</td>
          </tr>
        `);
      }
    });

    const labSectionHtml = [`
      ${normalLabRows.length > 0 ? `
        <div class="section">
          <div class="section-title">Laboratoire</div>
          <table>
            <thead>
              <tr><th>Date</th><th>Echantillon</th><th>Examen</th><th>Délai</th><th>Prix & paiement</th><th>Résultat</th><th>Interprétation</th><th>Diagnostic</th></tr>
            </thead>
            <tbody>
              ${normalLabRows.join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      ${nfsLabRows.length > 0 ? `
        <div class="section">
          <div class="section-title">Laboratoire</div>
          <table>
            <thead>
              <tr><th>Date</th><th>Echantillon</th><th>Examen</th><th>Délai</th><th>Prix & paiement</th><th>Resultats</th></tr>
            </thead>
            <tbody>
              ${nfsLabRows.join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `].join('');

    function translatePrescriptionStatus(status?: string | null) {
      if (!status) return "Statut inconnu";
      const s = String(status).trim().toUpperCase();
      switch (s) {
        case "PENDING":
        case "AWAITING":
          return "En attente";
        case "ACTIVE":
        case "ISSUED":
          return "Active";
        case "COMPLETED":
        case "DONE":
          return "Terminé";
        case "DISPENSED":
          return "Dispensé";
        case "CANCELLED":
        case "CANCELED":
          return "Annulée";
        case "DRAFT":
          return "Brouillon";
        default:
          return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      }
    }

    

    const displayService = (() => {
      const s = serviceLabel(patient) || '';
      const low = s.toLowerCase();
      if (low.includes('administr') || low.includes('gestion')) return '-';
      return s;
    })();

    const department =
      typeof patient.service === 'object' && patient.service && 'department' in patient.service
        ? (patient.service as { department?: string | null }).department || (patient.service as { name?: string | null }).name || '-'
        : typeof patient.service === 'string'
          ? patient.service
          : '-';

    const html = `
    <html>
      <head>
        <title>Dossier Patient - ${formatDoctorPatientName(patient)}</title>
        <style>
          body { font-family: "Calibri", Arial, sans-serif; color: #111; }
          .page { padding: 24px; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #222; padding-bottom: 16px; margin-bottom: 24px; }
          .brand { display: flex; align-items: center; gap: 16px; }
          .brand img { width: 56px; height: auto; }
          .clinic-name { font-size: 24px; font-weight: 700; letter-spacing: 0.04em; color: #0D9488; }
          .clinic-details { font-size: 11px; color: #4b5563; margin-top: 4px; }
          .title { text-align: right; }
          .title .document-type { font-size: 18px; font-weight: 700; color: #111827; }
          .title .date { font-size: 10px; color: #6b7280; margin-top: 4px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 12px; font-weight: 700; color: #111827; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #d1d5db; padding: 10px 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; font-weight: 700; }
          .label { width: 24%; font-weight: 700; }
          .footer { margin-top: 24px; font-size: 10px; color: #6b7280; border-top: 1px solid #d1d5db; padding-top: 10px; }
          @media print {
            body { margin: 0; padding: 0; }
            .page { padding: 18mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="brand">
              <img src="${clinic.documentLogoUrl || "/images/logo/icone.png"}" alt="Logo clinique" />
              <div>
                <div class="clinic-name">${clinicName}</div>
                <div class="clinic-details">Dossier médical officiel — système Aulia Care</div>
                <div class="clinic-details">${clinicContact}</div>
                ${legalReferences ? `<div class="clinic-details">${legalReferences}</div>` : ''}
              </div>
            </div>
            <div class="title">
              <div class="document-type">Dossier Patient Administratif</div>
              <div class="date">Créé le ${new Date().toLocaleDateString('fr-FR')}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Informations du patient</div>
            <table>
              <tbody>
                <tr><td class="label">Nom complet</td><td>${formatDoctorPatientName(patient)}</td></tr>
                <tr><td class="label">ID patient</td><td>${formatDossierId(position || 1, patient)}</td></tr>
                <tr><td class="label">Sexe</td><td>${patient.gender || '—'}</td></tr>
                <tr><td class="label">Date de naissance</td><td>${patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('fr-FR') : '—'}</td></tr>
                <tr><td class="label">Téléphone</td><td>${patient.phone || '—'}</td></tr>
                <tr><td class="label">Email</td><td>${patient.email || '—'}</td></tr>
                <tr><td class="label">Adresse</td><td>${patient.address || '—'}</td></tr>
                <tr><td class="label">Profession</td><td>${patient.profession || '—'}</td></tr>
                <tr><td class="label">Nationalité</td><td>${patient.nationality || '—'}</td></tr>
                <tr><td class="label">Département</td><td>${department}</td></tr>
                <tr><td class="label">Service</td><td>${displayService}</td></tr>
                <tr><td class="label">Médecin</td><td>${doctorLabel(patient.assignedDoctor)}</td></tr>
              </tbody>
            </table>
          </div>

          ${(patient.familyContacts || []).length > 0 ? `
          <div class="section">
            <div class="section-title">Contacts famille</div>
            <table>
              <thead>
                <tr><th>Nom</th><th>Relation</th><th>Téléphone</th></tr>
              </thead>
              <tbody>${familyRows}</tbody>
            </table>
          </div>
          ` : ''}

          ${(visibleConsultations || []).length > 0 ? `
          <div class="section">
            <div class="section-title">Consultations</div>
            <table>
              <thead>
                <tr><th>Date</th><th>Motif</th><th>Médecin</th><th>Diagnostique</th></tr>
              </thead>
              <tbody>${consultationRows}</tbody>
            </table>
          </div>
          ` : ''}

          ${(patient.prescriptions || []).length > 0 ? `
          <div class="section">
            <div class="section-title">Prescriptions</div>
            <table>
              <thead>
                <tr><th>Date</th><th>Prescripteur</th><th>Médicaments</th><th>Statut</th></tr>
              </thead>
              <tbody>${prescriptionRows}</tbody>
            </table>
          </div>
          ` : ''}

          ${(patient.labRequests || []).length > 0 ? `
          <div class="section">
            <div class="section-title">Laboratoire</div>
            <table>
              <thead>
                <tr><th>Date</th><th>Echantillon</th><th>Examen</th><th>Délai</th><th>Prix & paiement</th><th>Résultat</th><th>Interprétation</th><th>Diagnostic</th></tr>
              </thead>
              <tbody>
                ${labSectionHtml}
              </tbody>
            </table>
          </div>
          ` : ''}

          ${(patient.hospitalizations || []).length > 0 ? `
          <div class="section">
            <div class="section-title">Hospitalisations</div>
            <table>
              <thead>
                <tr><th>Date</th><th>Statut</th><th>Raison</th><th>Lit</th></tr>
              </thead>
              <tbody>${hospitalizationRows}</tbody>
            </table>
          </div>
          ` : ''}

          ${(operationItems && operationItems.length) ? `
          <div class="section">
            <div class="section-title">Opérations</div>
            <table>
              <thead>
                <tr><th>Date</th><th>Libellé</th><th>Détails</th></tr>
              </thead>
              <tbody>${operationsRows}</tbody>
            </table>
          </div>
          ` : ''}

          <div class="footer">
            ${clinic.documentFooter || `${clinicName} — dossier patient imprimé depuis Aulia Care.`}
          </div>
        </div>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 300);
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"><p className="text-xs text-slate-500">{label}</p><div className="mt-1 font-medium text-slate-900 dark:text-white">{value}</div></div>;
}

function TimelineCard({ title, subtitle, text }: { title: string; subtitle: string; text: string }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950"><p className="font-semibold text-slate-900 dark:text-white">{title}</p><p className="mt-1 text-xs text-slate-500">{subtitle}</p><p className="mt-2 text-slate-600 dark:text-slate-300">{text}</p></div>;
}

function StatusBadge({ label }: { label: string }) {
  const classes = label === 'Non reçu'
    ? 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
    : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  return <span className={classes}>{label}</span>;
}

function AccessBadge({ access }: { access?: DoctorPatient["access"] }) {
  if (access?.canWrite) {
    return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Ecriture</span>;
  }
  return <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Lecture</span>;
}

function Empty() {
  return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-950">Aucune donnee disponible.</p>;
}
