import { DoctorPatient, formatDoctorPatientName } from "../../api/doctor";

export const formatDateTime = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";

export const serviceLabel = (patient: DoctorPatient) =>
  typeof patient.service === "string" ? patient.service : patient.service?.name || "Service non renseigne";

export const doctorLabel = (doctor?: DoctorPatient["assignedDoctor"] | null) =>
  doctor?.displayName || [doctor?.firstName, doctor?.lastName].filter(Boolean).join(" ") || "Aucun medecin";

export const patientSearchText = (patient: DoctorPatient) =>
  [formatDoctorPatientName(patient), patient.phone, patient.email, serviceLabel(patient), patient.workflowStatus, doctorLabel(patient.assignedDoctor)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const consultationLabel = (consultation: NonNullable<DoctorPatient["consultations"]>[number]) =>
  `${consultation.chiefComplaint || "Consultation"} - ${formatDateTime(consultation.createdAt)}`;

export const hasConsultations = (patient: DoctorPatient) => Boolean(patient.consultations?.length);
