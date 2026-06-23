import { apiFetch } from "../config/api";

export type PatientProfile = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  bloodType?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  nationality?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  familyContacts?: Array<{ id?: string; name: string; relation?: string | null; relationship?: string | null; phone?: string | null; email?: string | null; address?: string | null }>;
  workflowStatus?: string;
  priority?: string | null;
  service?: { name?: string | null } | null;
  receptionist?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null;
  medicalHistories?: Array<{ eventDate?: string; kind?: string; details?: string | null }>;
  vitalSigns?: Array<{ type: string; value: string; unit?: string | null; recordedAt: string }>;
  consultations?: Array<{ createdAt: string; diagnosis?: string | null; clinicalSummary?: string | null; provider?: { displayName?: string | null } | null }>;
  prescriptions?: Array<{ prescribingDate: string; instruction?: string | null; status?: string; prescriber?: { displayName?: string | null } | null; lineItems?: Array<{ dosage?: string; frequency?: string; quantity?: number; notes?: string | null }> }>;
  labRequests?: Array<{ requestedAt: string; status: string; specimenType?: string | null; results?: Array<{ resultName: string; resultValue: string; units?: string | null }> }>;
  imagingRequests?: Array<{ createdAt: string; status: string; modality: string; bodyPart: string; report?: { impression?: string | null } | null }>;
  appointments?: Array<{ scheduledAt: string; reason?: string | null; status: string; serviceUnit?: { name?: string | null } | null }>;
  hospitalizations?: Array<{ admittedAt: string; dischargedAt?: string | null; status: string; admissionReason?: string | null }>;
  invoices?: Array<{ totalAmount: string | number; balanceDue: string | number; status: string; issuedAt: string }>;
};

export const fetchMyPatientProfile = async () => {
  return apiFetch<PatientProfile>("/patients/me/profile");
};
