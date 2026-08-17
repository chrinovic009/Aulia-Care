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
  consultations?: Array<{ id?: string; createdAt: string; diagnosis?: string | null; clinicalSummary?: string | null; assessment?: string | null; plan?: string | null; provider?: { displayName?: string | null; firstName?: string | null; lastName?: string | null; specialty?: string | null } | null }>;
  prescriptions?: Array<{ id?: string; prescribingDate: string; instruction?: string | null; status?: string; prescriber?: { displayName?: string | null; firstName?: string | null; lastName?: string | null; specialty?: string | null } | null; lineItems?: Array<{ dosage?: string; frequency?: string; quantity?: number; durationDays?: number | null; notes?: string | null; medication?: { name?: string; strength?: string | null; unit?: string | null } | null }> }>;
  labRequests?: Array<{ id?: string; requestedAt: string; status: string; specimenType?: string | null; requestedBy?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null; results?: Array<{ resultName: string; resultValue: string; units?: string | null; resultStatus?: string; reportedAt?: string; interpretation?: string | null; parameters?: Array<{ valueNumeric?: string | number | null; valueText?: string | null; interpretation?: string | null; labTestParameter?: { name?: string; unit?: string | null; referenceRange?: string | null } | null }> }> }>;
  imagingRequests?: Array<{ createdAt: string; status: string; modality: string; bodyPart: string; report?: { impression?: string | null } | null }>;
  appointments?: Array<{ id?: string; scheduledAt: string; reason?: string | null; status: string; serviceUnit?: { name?: string | null } | null }>;
  hospitalizations?: Array<{ id?: string; admittedAt: string; dischargedAt?: string | null; status: string; admissionReason?: string | null; dischargeReason?: string | null; bedNumber?: string | null; ServiceUnit?: { name?: string | null; location?: string | null } | null; physician?: { displayName?: string | null; firstName?: string | null; lastName?: string | null; specialty?: string | null } | null; nurseInCharge?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null; nurseAssignments?: Array<{ coverage: string; nurse?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null }>; nursingCareTasks?: Array<{ id?: string; title: string; instructions?: string | null; dueAt: string; status: string; completedAt?: string | null; assignedNurse?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null }>; medicationAdministrations?: Array<{ id?: string; scheduledAt: string; administeredAt?: string | null; status: string; doseGiven?: string | null; observation?: string | null; prescriptionLine?: { medication?: { name?: string; strength?: string | null; unit?: string | null } | null } | null }> }>;
  invoices?: Array<{ id?: string; totalAmount: string | number; balanceDue: string | number; status: string; issuedAt: string; dueDate?: string | null; payments?: Array<{ amount: string | number; paidAt: string; method: string; reference?: string | null }>; discountRequests?: Array<{ amount: string | number; status: string; reason: string; reviewedAt?: string | null }> }>;
};

export const fetchMyPatientProfile = async () => {
  return apiFetch<PatientProfile>("/patients/me/profile");
};

export type WearableDashboard = {
  id: string;
  firstName: string;
  lastName: string;
  wearableDevices: Array<{
    id: string;
    displayName?: string | null;
    status: string;
    lastSeenAt?: string | null;
    measurements: Array<{ id: string; metric: string; value: string | number; unit: string; measuredAt: string; quality: string }>;
    emergencyLocations: Array<{ latitude: string | number; longitude: string | number; accuracyMeters?: string | number | null; capturedAt: string }>;
  }>;
};

export const fetchWearableDashboard = (patientId: string) => apiFetch<WearableDashboard>(`/wearables/patients/${patientId}/dashboard`);

export type ChildLink = {
  id: string;
  acceptedAt?: string | null;
  child: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string | null;
    wearableDevices: Array<{ id: string; displayName?: string | null; lastSeenAt?: string | null; measurements: Array<{ metric: string; value: string | number; unit: string; measuredAt: string; quality: string }> }>;
  };
};

export const fetchMyChildren = () => apiFetch<ChildLink[]>("/wearables/parent-child-links/me");
export const submitDailyCheckin = (payload: { feelsWell: boolean; message?: string; symptoms?: string[]; voiceTranscript?: string }) => apiFetch<{ id: string; submittedAt: string; message: string }>("/patients/me/daily-checkins", { method: "POST", body: JSON.stringify(payload) });
