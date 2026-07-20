import { apiFetch } from "../config/api";

export type DoctorPatient = {
  id: string;
  externalId?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  profession?: string | null;
  nationality?: string | null;
  bloodType?: string | null;
  admissionType?: string | null;
  workflowStatus?: string;
  priority?: string | null;
  service?: string | { id: string; name: string } | null;
  familyContacts?: Array<{ id?: string; name: string; relationship?: string | null; phone?: string | null; email?: string | null; address?: string | null }>;
  vitalSigns?: Array<{ type: string; value: string; unit?: string | null; recordedAt: string; note?: string | null; recordedBy?: { displayName?: string | null } | null }>;
  medicalHistories?: Array<{ id: string; kind: string; details: string; eventDate: string; createdBy?: { displayName?: string | null; primaryRole?: string | null } | null }>;
  consultations?: Array<{ id: string; status: string; chiefComplaint?: string | null; clinicalSummary?: string | null; diagnosis?: string | null; createdAt: string; provider?: { id: string; displayName?: string | null; firstName?: string | null; lastName?: string | null; specialty?: string | null } | null }>;
  prescriptions?: Array<{ id: string; status: string; prescribingDate: string; instruction?: string | null; prescriber?: { displayName?: string | null } | null; lineItems?: Array<{ dosage?: string | null; frequency?: string | null; notes?: string | null; quantity?: number; medication?: { name?: string | null; unit?: string | null; strength?: string | null } | null }> }>;
  labRequests?: Array<{ id: string; status: string; requestedAt: string; specimenType?: string | null; notes?: string | null; results?: Array<{ resultName: string; resultValue: string; units?: string | null; verified?: boolean; interpretation?: string | null }> }>;
  imagingRequests?: Array<{ id: string; status: string; createdAt: string; modality: string; bodyPart: string; report?: { impression?: string | null } | null }>;
  hospitalizations?: Array<{ id: string; status: string; admittedAt: string; admissionReason?: string | null; bedNumber?: string | null; physician?: { displayName?: string | null } | null; nurseInCharge?: { displayName?: string | null } | null }>;
  hasPendingAppointmentWithoutConsultation?: boolean;
  assignedDoctor?: { id: string; displayName?: string | null; firstName?: string | null; lastName?: string | null; specialty?: string | null } | null;
  access?: { mode: "WRITE" | "READ_ONLY"; canWrite: boolean; reason: string };
  latestConsultation?: { id: string; status: string; chiefComplaint?: string | null; clinicalSummary?: string | null; diagnosis?: string | null; createdAt: string; providerId?: string | null; provider?: { id: string; displayName?: string | null; firstName?: string | null; lastName?: string | null } | null } | null;
};

export const fetchDoctorAssignedPatients = () => {
  return apiFetch<DoctorPatient[]>("/patients/doctor/assigned");
};

export const fetchDoctorVisiblePatients = () => {
  return apiFetch<DoctorPatient[]>("/patients/doctor/visible");
};

export const formatDoctorPatientName = (patient: DoctorPatient) =>
  [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ");

export type AvailableMedication = {
  id: string;
  code: string;
  name: string;
  unit: string;
  strength?: string | null;
  availableQuantity: number;
  unitPrice?: string | number | null;
  category?: { id: string; name: string; section?: { id: string; name: string } | null } | null;
};

export const saveClinicalSections = (consultationId: string, payload: Record<string, unknown>) =>
  apiFetch(`/consultations/${consultationId}/clinical-sections`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createLabRequest = (consultationId: string, payload: Record<string, unknown>) =>
  apiFetch(`/consultations/${consultationId}/lab-requests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const createPrescription = (consultationId: string, payload: Record<string, unknown>) =>
  apiFetch(`/consultations/${consultationId}/prescriptions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchAvailableMedications = () =>
  apiFetch<AvailableMedication[]>("/pharmacy/available");
