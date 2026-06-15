import { apiFetch } from "../config/api";

export type DoctorPatient = {
  id: string;
  firstName: string;
  lastName: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  workflowStatus?: string;
  priority?: string | null;
  service?: string | null;
  vitalSigns?: Array<{ type: string; value: string; unit?: string | null; recordedAt: string; note?: string | null }>;
  consultations?: Array<{ id: string; status: string; chiefComplaint?: string | null; clinicalSummary?: string | null; diagnosis?: string | null; createdAt: string }>;
  prescriptions?: Array<{ id: string; status: string; prescribingDate: string; instruction?: string | null; lineItems?: Array<{ dosage?: string | null; frequency?: string | null; notes?: string | null }> }>;
  labRequests?: Array<{ id: string; status: string; requestedAt: string; specimenType?: string | null; results?: Array<{ resultName: string; resultValue: string; units?: string | null }> }>;
  imagingRequests?: Array<{ id: string; status: string; createdAt: string; modality: string; bodyPart: string; report?: { impression?: string | null } | null }>;
};

export const fetchDoctorAssignedPatients = () => {
  return apiFetch<DoctorPatient[]>("/patients/doctor/assigned");
};

export const formatDoctorPatientName = (patient: DoctorPatient) =>
  [patient.firstName, patient.lastName].filter(Boolean).join(" ");
