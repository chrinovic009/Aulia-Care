import { API_CONFIG, apiFetch } from "../config/api";

export type NursePatient = {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  workflowStatus: "EN_ATTENTE_INFIRMERIE" | string;
  priority?: string | null;
  arrivalAt?: string | null;
  createdAt: string;
  service?: string | null;
  serviceId?: string | null;
  receptionist?: string | null;
  vitals: {
    temperature?: string | null;
    bloodPressure?: string | null;
    spo2?: string | null;
    heartRate?: string | null;
    respiratoryRate?: string | null;
  };
  lastVitalRecordedAt?: string | null;
};

export type RecordVitalSignsPayload = {
  temperature?: string;
  bloodPressure?: string;
  spo2?: string;
  heartRate?: string;
  respiratoryRate?: string;
  notes?: string;
  physicianId?: string;
};

export const fetchPatientsAwaitingVitals = async (): Promise<NursePatient[]> => {
  return apiFetch<NursePatient[]>(API_CONFIG.NURSE.AWAITING_VITALS);
};

export const recordPatientVitalSigns = async (
  patientId: string,
  payload: RecordVitalSignsPayload,
) => {
  return apiFetch(API_CONFIG.NURSE.RECORD_VITAL_SIGNS(patientId), {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const isUrgentPatient = (patient: NursePatient): boolean => {
  const priority = (patient.priority || "").toLowerCase();
  return ["urgent", "urgence", "high", "haute", "critical", "critique", "prioritaire"].includes(priority);
};

export const formatPatientName = (patient: NursePatient): string => {
  return [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ");
};
