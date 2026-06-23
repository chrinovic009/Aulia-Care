import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import {
  DoctorPatient,
  fetchDoctorVisiblePatients,
  formatDoctorPatientName,
} from "../../api/doctor";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const serviceLabel = (patient: DoctorPatient) =>
  typeof patient.service === "string" ? patient.service : patient.service?.name || "Service non renseigne";

const doctorLabel = (doctor?: DoctorPatient["assignedDoctor"] | null) =>
  doctor?.displayName || [doctor?.firstName, doctor?.lastName].filter(Boolean).join(" ") || "Aucun medecin";

const parseClinicalSummary = (value?: string | null) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
};

const latestVital = (patient: DoctorPatient, type: string) =>
  patient.vitalSigns?.find((vital) => vital.type === type);

export default function PatientsMedecin() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "WRITE" | "READ_ONLY">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPatients = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDoctorVisiblePatients();
      setPatients(data);
      setSelectedPatientId((current) => current || data[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les dossiers patients.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
    const handler = () => loadPatients();
    window.addEventListener("d7:patient.updated", handler);
    window.addEventListener("d7:consultation.created", handler);
    window.addEventListener("d7:clinicalDataUpdated", handler);
    window.addEventListener("d7:lab.request.created", handler);
    window.addEventListener("d7:lab.result.created", handler);
    return () => {
      window.removeEventListener("d7:patient.updated", handler);
      window.removeEventListener("d7:consultation.created", handler);
      window.removeEventListener("d7:clinicalDataUpdated", handler);
      window.removeEventListener("d7:lab.request.created", handler);
      window.removeEventListener("d7:lab.result.created", handler);
    };
  }, []);

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
        doctorLabel(patient.assignedDoctor),
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesFilter && (!normalized || haystack.includes(normalized));
    });
  }, [patients, search, filter]);

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || filteredPatients[0] || null;

  const metrics = useMemo(() => ({
    total: patients.length,
    write: patients.filter((patient) => patient.access?.canWrite).length,
    readonly: patients.filter((patient) => !patient.access?.canWrite).length,
    urgent: patients.filter((patient) => ["urgent", "urgence", "prioritaire", "critical"].includes((patient.priority || "").toLowerCase())).length,
  }), [patients]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950 sm:p-6">
      <PageMeta title="Patients medecin | D7 Clinique" description="Dossiers patients visibles par les medecins." />
      <PageBreadcrumb pageTitle="Patients" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Dossiers partages</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Patients orientes vers les medecins</h1>
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

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
                  </div>
                  <AccessBadge access={patient.access} />
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          {!selectedPatient ? (
            <p className="text-sm text-slate-500">Selectionnez un patient.</p>
          ) : (
            <PatientRecord patient={selectedPatient} />
          )}
        </main>
      </div>
    </div>
  );
}

function PatientRecord({ patient }: { patient: DoctorPatient }) {
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">{formatDoctorPatientName(patient)}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {patient.gender || "-"} - {patient.phone || "Telephone non renseigne"} - {serviceLabel(patient)}
          </p>
          <p className="mt-1 text-sm text-slate-500">Medecin responsable: {doctorLabel(patient.assignedDoctor)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => printPatientRecord(patient)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-800"
          >
            🖨️ Imprimer le dossier
          </button>
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={patient.workflowStatus || "STATUT"} />
            <AccessBadge access={patient.access} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Info label="ID dossier" value={patient.externalId || patient.id} />
        <Info label="Naissance" value={patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "-"} />
        <Info label="Email" value={patient.email || "-"} />
        <Info label="Adresse" value={patient.address || "-"} />
        <Info label="Profession" value={patient.profession || "-"} />
        <Info label="Nationalite" value={patient.nationality || "-"} />
        <Info label="Groupe sanguin" value={patient.bloodType || "-"} />
        <Info label="Priorite" value={patient.priority || "Normale"} />
      </div>

      <Section title="Signes vitaux">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ["Temperature", "TEMPERATURE"],
            ["Tension", "BLOOD_PRESSURE"],
            ["SpO2", "OXYGEN_SATURATION"],
            ["Pouls", "HEART_RATE"],
            ["Respiration", "RESPIRATORY_RATE"],
            ["Poids", "WEIGHT"],
            ["Taille", "HEIGHT"],
            ["P. thoracique", "CHEST_CIRCUMFERENCE"],
            ["P. brachial", "ARM_CIRCUMFERENCE"],
          ].map(([label, type]) => {
            const vital = latestVital(patient, type);
            return <Info key={type} label={label} value={vital ? `${vital.value} ${vital.unit || ""}`.trim() : "-"} />;
          })}
        </div>
      </Section>

      <Section title="Contacts famille">
        {(patient.familyContacts || []).length === 0 ? <Empty /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {patient.familyContacts?.map((contact) => (
              <div key={contact.id || contact.name} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">{contact.name}</p>
                <p className="mt-1 text-slate-500">{contact.relationship || "-"} - {contact.phone || "-"}</p>
                <p className="mt-1 text-slate-500">{contact.address || contact.email || ""}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Consultations">
        {(patient.consultations || []).length === 0 ? <Empty /> : (
          <div className="space-y-3">
            {patient.consultations?.map((consultation) => (
              <ClinicalConsultation key={consultation.id} consultation={consultation} />
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Examens laboratoire">
          {(patient.labRequests || []).length === 0 ? <Empty /> : patient.labRequests?.map((request) => (
            <TimelineCard
              key={request.id}
              title={request.specimenType || "Examen"}
              subtitle={`${request.status} - ${formatDate(request.requestedAt)}`}
              text={request.results?.length ? request.results.map((result) => `${result.resultName}: ${result.resultValue} ${result.units || ""}`).join(", ") : "Resultat en attente."}
            />
          ))}
        </Section>

        <Section title="Prescriptions">
          {(patient.prescriptions || []).length === 0 ? <Empty /> : patient.prescriptions?.map((prescription) => (
            <TimelineCard
              key={prescription.id}
              title={prescription.prescriber?.displayName || prescription.status}
              subtitle={formatDate(prescription.prescribingDate)}
              text={prescription.lineItems?.map((line) => `${line.medication?.name || "Medicament"} - ${line.dosage || ""} - ${line.frequency || ""} - qte ${line.quantity || 1}`).join(", ") || prescription.instruction || "-"}
            />
          ))}
        </Section>

        <Section title="Hospitalisations">
          {(patient.hospitalizations || []).length === 0 ? <Empty /> : patient.hospitalizations?.map((item) => (
            <TimelineCard
              key={item.id}
              title={`${item.status} ${item.bedNumber ? `- lit ${item.bedNumber}` : ""}`}
              subtitle={formatDate(item.admittedAt)}
              text={item.admissionReason || "Hospitalisation"}
            />
          ))}
        </Section>

        <Section title="Historique medical">
          {(patient.medicalHistories || []).length === 0 ? <Empty /> : patient.medicalHistories?.map((item) => (
            <HistoryEventCard key={item.id} item={item} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function ClinicalConsultation({ consultation }: { consultation: NonNullable<DoctorPatient["consultations"]>[number] }) {
  const parsed = parseClinicalSummary(consultation.clinicalSummary);
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{consultation.chiefComplaint || "Consultation medicale"}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(consultation.createdAt)} - {consultation.provider?.displayName || "Medecin"}</p>
        </div>
        <StatusBadge label={consultation.status} />
      </div>

      {parsed ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Info label="Antecedents" value={joinValues(parsed.medicalHistory, ["knownDiseases", "surgeries", "allergies", "currentMedications", "familyHistory"])} />
          <Info label="Anamnese" value={joinValues(parsed.currentSymptoms, ["onset", "painLocation", "intensity", "aggravatingFactors", "associatedSymptoms"])} />
          <Info label="Examen clinique" value={joinValues(parsed.clinicalExam, ["generalState", "auscultation", "palpation", "focusedExam"])} />
          <Info label="Diagnostic" value={[parsed.diagnosis?.principal, ...(parsed.diagnosis?.hypotheses || [])].filter(Boolean).join(" | ") || consultation.diagnosis || "-"} />
          <Info label="Traitement" value={parsed.treatmentPlan?.notes || "-"} />
          <Info label="Suivi" value={parsed.followUp?.notes || "-"} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{consultation.clinicalSummary || consultation.diagnosis || "Aucune note clinique."}</p>
      )}
    </div>
  );
}

function HistoryEventCard({ item }: { item: NonNullable<DoctorPatient["medicalHistories"]>[number] }) {
  const title = historyTitle(item.kind);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(item.eventDate)} - {item.createdBy?.displayName || "Systeme"}</p>
        </div>
        <StatusBadge label={item.kind} />
      </div>
      <div className="mt-4">{renderHistoryDetails(item.kind, item.details)}</div>
    </div>
  );
}

function historyTitle(kind: string) {
  const labels: Record<string, string> = {
    MEDICAL_CONSULTATION: "Consultation medicale",
    NURSE_ORIENTATION: "Orientation infirmiere",
    ADMISSION_METADATA: "Admission reception",
    LAB_REQUEST: "Demande d'examen",
    PRESCRIPTION_CREATED: "Prescription creee",
  };
  return labels[kind] || kind.replace(/_/g, " ").toLowerCase();
}

function renderHistoryDetails(kind: string, details: string) {
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed !== "object" || !parsed) return <p className="text-slate-600 dark:text-slate-300">{details}</p>;

    if (kind === "MEDICAL_CONSULTATION") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Info label="Antecedents" value={joinValues(parsed.medicalHistory, ["knownDiseases", "surgeries", "allergies", "currentMedications", "familyHistory"])} />
          <Info label="Anamnese" value={joinValues(parsed.currentSymptoms, ["onset", "painLocation", "intensity", "aggravatingFactors", "associatedSymptoms"])} />
          <Info label="Examen clinique" value={joinValues(parsed.clinicalExam, ["generalState", "auscultation", "palpation", "focusedExam"])} />
          <Info label="Diagnostic" value={[parsed.diagnosis?.principal, ...(parsed.diagnosis?.hypotheses || [])].filter(Boolean).join(" | ") || "-"} />
          <Info label="Traitement" value={parsed.treatmentPlan?.notes || "-"} />
          <Info label="Suivi" value={parsed.followUp?.notes || "-"} />
        </div>
      );
    }

    if (kind === "NURSE_ORIENTATION") {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Info label="Medecin oriente" value={parsed.physicianName || parsed.physicianId || "-"} />
          <Info label="Consultation creee" value={parsed.consultationId || "-"} />
          <Info label="Observation infirmiere" value={parsed.notes || "-"} />
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

    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(parsed)
          .filter(([, value]) => value !== null && value !== "" && value !== undefined)
          .map(([key, value]) => (
            <Info key={key} label={humanizeKey(key)} value={typeof value === "object" ? formatObjectValue(value) : String(value)} />
          ))}
      </div>
    );
  } catch {
    return <p className="text-slate-600 dark:text-slate-300">{details}</p>;
  }
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

function printPatientRecord(patient: DoctorPatient) {
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

  const consultationRows = (patient.consultations || []).map((consultation) => `
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
        <td>${prescription.status}</td>
      </tr>
    `).join("");

  const historyKindLabel = (kind: string) => {
    const labels: Record<string, string> = {
      MEDICAL_CONSULTATION: "Consultation médicale",
      NURSE_ORIENTATION: "Orientation infirmière",
      ADMISSION_METADATA: "Admission réception",
    };
    return labels[kind] ?? kind.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
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

    const toLine = (label: string, value?: string | number | null) =>
      value ? `<div><strong>${label} :</strong> ${value}</div>` : "";

    if (kind === "MEDICAL_CONSULTATION") {
      const rows: string[] = [];
      if (parsed.diagnosis?.principal) rows.push(toLine("Diagnostic", parsed.diagnosis.principal));
      if (parsed.treatmentPlan?.notes) rows.push(toLine("Traitement", parsed.treatmentPlan.notes));
      if (parsed.followUp?.notes) rows.push(toLine("Suivi", parsed.followUp.notes));
      if (parsed.clinicalExam?.generalState) rows.push(toLine("État général", parsed.clinicalExam.generalState));
      if (parsed.currentSymptoms?.onset) rows.push(toLine("Début des symptômes", parsed.currentSymptoms.onset));
      return rows.length > 0 ? rows.join("") : details || "-";
    }

    if (kind === "NURSE_ORIENTATION") {
      const rows: string[] = [];
      if (parsed.physicianName) rows.push(toLine("Médecin orienté", parsed.physicianName));
      if (parsed.consultationId) rows.push(toLine("Consultation", parsed.consultationId));
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
          .clinic-name { font-size: 24px; font-weight: 700; letter-spacing: 0.04em; color: #1f2937; }
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
              <img src="/images/favicon.png" alt="Logo clinique" />
              <div>
                <div class="clinic-name">D7 Clinique</div>
                <div class="clinic-details">Centre hospitalier régional - Services médicaux et administratifs</div>
                <div class="clinic-details">Adresse: Zone de santé, Dilala | Tel: +243 987 299 227 | Email: fondationd7clinic@gmail.com</div>
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
                <tr><td class="label">ID patient</td><td>${patient.externalId || patient.id}</td></tr>
                <tr><td class="label">Sexe</td><td>${patient.gender || '—'}</td></tr>
                <tr><td class="label">Date de naissance</td><td>${patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('fr-FR') : '—'}</td></tr>
                <tr><td class="label">Téléphone</td><td>${patient.phone || '—'}</td></tr>
                <tr><td class="label">Email</td><td>${patient.email || '—'}</td></tr>
                <tr><td class="label">Adresse</td><td>${patient.address || '—'}</td></tr>
                <tr><td class="label">Profession</td><td>${patient.profession || '—'}</td></tr>
                <tr><td class="label">Nationalité</td><td>${patient.nationality || '—'}</td></tr>
                <tr><td class="label">Service</td><td>${serviceLabel(patient)}</td></tr>
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

          ${(patient.consultations || []).length > 0 ? `
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

          ${(patient.medicalHistories || []).length > 0 ? `
          <div class="section">
            <div class="section-title">Historique médical</div>
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Détails</th></tr>
              </thead>
              <tbody>${medicalHistoryRows}</tbody>
            </table>
          </div>
          ` : ''}

          <div class="footer">
            D7 Clinique - dossier patient administratif imprimé depuis le système interne.
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
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{label}</span>;
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
