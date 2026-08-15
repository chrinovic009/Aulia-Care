export type PatientSummary = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  dob?: string;
};

export type ReceptionAppointment = {
  id: string;
  patientName: string;
  doctorRequested: string;
  service: string;
  status: string;
  priority: string;
  phone: string;
  age: number;
  dossier: string;
  lastVisits: string;
  motive: string;
  requestedOn: string;
  dateRequested: string;
};

const normalizePatientName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const normalizePhone = (phone: string) => phone.replace(/[^0-9+]/g, "");
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const fetchPatientsFromDatabase = async (): Promise<PatientRecord[]> => {
  return fetchDbJson<PatientRecord[]>('/patients');
};

export type ReceptionVisitRecord = {
  id: string;
  visitType: string;
  reason?: string | null;
  status: string;
  arrivedAt: string;
  cancellationReason?: string | null;
  patient: {
    id: string;
    externalId?: string | null;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    insuranceProvider?: string | null;
  };
  receptionist?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null;
  service?: { id: string; name: string } | null;
  invoice?: { id: string; status: string; totalAmount: string | number; balanceDue: string | number } | null;
  appointment?: { id: string; status: string; scheduledAt: string; statusReason?: string | null } | null;
};

export const fetchReceptionVisits = async (limit = 200): Promise<ReceptionVisitRecord[]> =>
  fetchDbJson<ReceptionVisitRecord[]>(`/patients/reception-visits?limit=${Math.min(Math.max(limit, 1), 250)}`);

export type HospitalizationRoomInventoryItem = {
  id: string;
  number: string;
  service: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  status: string;
};

export type HospitalizationTimelineEvent = {
  id: string;
  date: string;
  event: string;
  type: string;
};

export type HospitalizationRecord = {
  id: string;
  admittedAt: string;
  dischargedAt?: string;
  status?: string;
  admissionReason: string;
  dischargeReason?: string;
  bedNumber?: string;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    externalId?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
  };
  ServiceUnit?: {
    id: string;
    name: string;
    department?: { id: string; name: string };
  };
  bed?: {
    id: string;
    code: string;
    room?: { id: string; number: string; serviceUnit?: { name: string } };
  };
  physician?: { id: string; displayName?: string; firstName?: string; lastName?: string };
  nurseInCharge?: { id: string; displayName?: string; firstName?: string; lastName?: string };
};

export type HospitalizationStats = {
  hospitalized: number;
  availableRooms: number;
  capacityRate: number;
  admissionsToday: number;
  emergencyAdmissions: number;
  totalBeds: number;
  occupiedBeds: number;
};

export const fetchAppointmentsFromDatabase = async () => {
  return fetchDbJson<Array<{ priority?: string; status?: string; scheduledAt?: string; requestedAt?: string; createdAt?: string }>>("/appointments");
};

export const fetchHospitalizationsFromDatabase = async () => {
  return fetchDbJson<HospitalizationRecord[]>('/hospitalizations');
};

export const searchHospitalizations = async (query: string) => {
  return fetchDbJson<HospitalizationRecord[]>(`/hospitalizations/search?q=${encodeURIComponent(query)}`);
};

export const fetchHospitalizationById = async (id: string) => {
  return fetchDbJson<HospitalizationRecord>(`/hospitalizations/${encodeURIComponent(id)}`);
};

export const fetchHospitalizationStats = async () => {
  return fetchDbJson<HospitalizationStats>('/hospitalizations/stats');
};

export const fetchHospitalizationRooms = async () => {
  return fetchDbJson<HospitalizationRoomInventoryItem[]>('/hospitalizations/rooms');
};

export const fetchHospitalizationTimeline = async (id: string) => {
  return fetchDbJson<HospitalizationTimelineEvent[]>(`/hospitalizations/${encodeURIComponent(id)}/timeline`);
};

export const createHospitalizationInDatabase = async (payload: any) => {
  const url = `/hospitalizations`;
  const fullUrl = `${API_BASE_URL.replace(/\/+$/, "")}${url.startsWith('/') ? url : `/${url}`}`;
  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getCookieAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Create hospitalization failed (${response.status}): ${text}`);
  }
  return await response.json();
};

export const fetchAppointmentMetricsFromDatabase = async () => {
  const appointments = await fetchAppointmentsFromDatabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = (dateValue?: string) => {
    if (!dateValue) return false;
    const date = new Date(dateValue);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
  };

  return {
    todayAppointments: appointments.filter((item) => isToday(item.scheduledAt || item.requestedAt || item.createdAt)).length,
  };
};

export const createAppointmentInDatabase = async (payload: any) => {
  const url = `/appointments`;
  const fullUrl = `${API_BASE_URL.replace(/\/+$/, "")}${url.startsWith('/') ? url : `/${url}`}`;
  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getCookieAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Create appointment failed (${response.status}): ${text}`);
  }
  return await response.json();
};

const buildSearchUrl = (params: { email?: string; phone?: string; name?: string }) => {
  const search = new URLSearchParams();
  if (params.email) search.set('email', params.email.trim());
  if (params.phone) search.set('phone', params.phone.trim());
  if (params.name) search.set('name', params.name.trim());
  return `/patients/search?${search.toString()}`;
};

export const findPatientByName = async (name: string) => {
  const normalizedName = normalizePatientName(name);
  if (!normalizedName) return null;
  try {
    const patients = await fetchDbJson<PatientRecord[]>(buildSearchUrl({ name }));
    return patients[0] ?? null;
  } catch {
    return null;
  }
};

export const searchPatients = async (name: string) => {
  const normalizedName = normalizePatientName(name);
  if (!normalizedName) return [];
  try {
    const patients = await fetchDbJson<PatientRecord[]>(buildSearchUrl({ name }));
    return patients;
  } catch {
    return [];
  }
};

export const fetchServices = async () => {
  try {
    return await fetchDbJson<any[]>('/services');
  } catch {
    return [];
  }
};

export const findPatientByPhone = async (phone: string) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  try {
    const patients = await fetchDbJson<PatientRecord[]>(buildSearchUrl({ phone }));
    return patients[0] ?? null;
  } catch {
    return null;
  }
};

export const findPatientByEmail = async (email: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  try {
    const patients = await fetchDbJson<PatientRecord[]>(buildSearchUrl({ email }));
    return patients[0] ?? null;
  } catch {
    return null;
  }
};

export const saveAdmission = async (admission: any) => {
  return createHospitalizationInDatabase(admission);
};

// ---- Patient API contracts ----
export type PatientRelation = {
  patientId: string;
  name: string;
  relation: string;
};

export type PatientRecord = {
  id: string;
  matricule: string;
  password: string;
  name: string;
  phone?: string;
  email?: string;
  dob?: string;
  gender?: string;
  createdAt: string;
  relations?: PatientRelation[];
  admissionType?: string;
  arrival?: string;
  receptionist?: string;
  service?: string | { id?: string; name?: string };
  firstName?: string;
  lastName?: string;
  doctor?: string;
  workflowStatus?: string;
  priority?: string;
  insurance?: { company?: string; policy?: string; coverageType?: string; coveragePct?: number; photo?: any; pdf?: any };
  profession?: string;
  contacts?: Array<{ name: string; relation: string; phone: string; address: string }>;
  familyContacts?: Array<{ name: string; relation: string; phone: string; address: string }>;
  allergies?: string[];
  status?: "Enregistré" | "Fiche en attente" | "Fiche validée" | "Fiche annulé" | "En suivi";
  amountDue?: number;
  paymentRequestId?: string;
  paymentStatus?: "pending" | "paid" | "cancelled" | "deferred";
  paymentMethod?: string;
  temperature?: string;
  bloodPressure?: string;
  spo2?: string;
  heartRate?: string;
  nextAction?: string;
  lastUpdate?: string;
  avatar?: string;
};


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const fetchDbJson = async <T>(path: string): Promise<T> => {
  const url = `${API_BASE_URL.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...getCookieAuthHeaders(),
    },
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`DB request failed (${response.status}): ${response.statusText}`);
  }
  return response.json() as Promise<T>;
};

const dispatchPatientRecordsUpdated = () => {
  try {
    window.dispatchEvent(new CustomEvent("d7:patientRecordsUpdated"));
  } catch {
    // ignore browser dispatch errors
  }
};

export const updatePatientRecord = async (
  payload: Partial<PatientRecord> & { id: string }
): Promise<PatientRecord | null> => {
  try {
    const url = `/patients/${payload.id}`;
    const fullUrl = `${API_BASE_URL.replace(/\/+$/, "")}${url.startsWith('/') ? url : `/${url}`}`;
    const response = await fetch(fullUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getCookieAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (response.ok) return (await response.json()) as PatientRecord;
  } catch { return null; }
};

export const createPatientAdmission = async (payload: Partial<PatientRecord>): Promise<PatientRecord> => {
  const url = `/patients/admissions`;
  const fullUrl = `${API_BASE_URL.replace(/\/+$/, "")}${url.startsWith('/') ? url : `/${url}`}`;
  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getCookieAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Admission failed (${response.status}): ${errorBody}`);
  }
  return (await response.json()) as PatientRecord;
};


import { getAuthHeaders as getCookieAuthHeaders } from "../config/api";
