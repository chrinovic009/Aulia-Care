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

const RECEPTION_APPOINTMENTS_KEY = "d7-clinic-reception-appointments";
const todayIso = new Date().toISOString();

const SAMPLE_RECEPTION_APPOINTMENTS: ReceptionAppointment[] = [
  {
    id: "rv-001",
    patientName: "Sarah Ilunga",
    service: "Cardiologie",
    doctorRequested: "Dr Mukendi",
    dateRequested: "22 mai",
    status: "En attente",
    priority: "Normale",
    phone: "+243812345678",
    age: 34,
    dossier: "D-001234",
    lastVisits: "Consultation cardiologie il y a 3 semaines",
    motive: "Douleur thoracique depuis 3 jours",
    requestedOn: "2026-05-16",
  },
  {
    id: "rv-002",
    patientName: "Jean Kabila",
    service: "Laboratoire",
    doctorRequested: "Aucun médecin spécifique",
    dateRequested: "19 mai",
    status: "Confirmé",
    priority: "Normale",
    phone: "+243820112233",
    age: 44,
    dossier: "D-001235",
    lastVisits: "Prélèvement sanguin le 10 mai",
    motive: "Contrôle de bilan lipidique",
    requestedOn: "2026-05-15",
  },
  {
    id: "rv-003",
    patientName: "Amina Mputu",
    service: "Urgences",
    doctorRequested: "Aucun médecin spécifique",
    dateRequested: "Aujourd'hui",
    status: "Urgent",
    priority: "Urgent",
    phone: "+243817654321",
    age: 28,
    dossier: "D-001236",
    lastVisits: "Hospitalisation urgence il y a 1 semaine",
    motive: "Accident, douleur abdominale",
    requestedOn: todayIso,
  },
  {
    id: "rv-004",
    patientName: "Driss Kone",
    service: "Pédiatrie",
    doctorRequested: "Dr Okapi",
    dateRequested: "21 mai",
    status: "Refusé",
    priority: "Normale",
    phone: "+243819876543",
    age: 8,
    dossier: "D-001237",
    lastVisits: "Vaccination le 02 mai",
    motive: "Fièvre persistante",
    requestedOn: "2026-05-15",
  },
];

export const getReceptionAppointments = (): ReceptionAppointment[] => {
  try {
    const raw = localStorage.getItem(RECEPTION_APPOINTMENTS_KEY);
    if (!raw) return SAMPLE_RECEPTION_APPOINTMENTS;
    return JSON.parse(raw) as ReceptionAppointment[];
  } catch {
    return SAMPLE_RECEPTION_APPOINTMENTS;
  }
};

export const saveReceptionAppointments = (appointments: ReceptionAppointment[]) => {
  try {
    localStorage.setItem(RECEPTION_APPOINTMENTS_KEY, JSON.stringify(appointments));
  } catch {
    // ignore
  }
};

export const getReceptionAppointmentMetrics = () => {
  const requests = getReceptionAppointments();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = (item: ReceptionAppointment) => {
    if (item.dateRequested === "Aujourd'hui") return true;
    const requested = new Date(item.requestedOn);
    requested.setHours(0, 0, 0, 0);
    return requested.getTime() === today.getTime();
  };

  return {
    waitingCount: requests.filter((item) => item.status === "En attente").length,
    todayAppointments: requests.filter(isToday).length,
  };
};

const normalizePatientName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const normalizePhone = (phone: string) => phone.replace(/[^0-9+]/g, "");
const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getStoredPatients = (): PatientRecord[] => {
  try {
    const raw = localStorage.getItem(PATIENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const getAllPatients = (): PatientRecord[] => {
  return getStoredPatients();
};

export const fetchPatientsFromDatabase = async (): Promise<PatientRecord[]> => {
  return fetchDbJson<PatientRecord[]>('/patients');
};

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
  const token = (() => {
    try {
      return localStorage.getItem('d7-clinic-access-token') || localStorage.getItem('d7-clinic-api-token') || localStorage.getItem('d7-clinic-auth-token');
    } catch { return null; }
  })();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers,
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
  const token = (() => {
    try {
      return localStorage.getItem('d7-clinic-access-token') || localStorage.getItem('d7-clinic-api-token') || localStorage.getItem('d7-clinic-auth-token');
    } catch { return null; }
  })();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers,
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
  return `/public/patients/search?${search.toString()}`;
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

export const findPatientByCredentials = (identifier: string, password: string) => {
  const normalized = identifier.trim().toLowerCase();
  return getStoredPatients().find((patient) =>
    patient.password === password &&
    (patient.matricule.toLowerCase() === normalized || (patient.email && patient.email.toLowerCase() === normalized))
  ) || null;
};

export const saveAdmission = async (admission: any) => {
  // Persist admission to backend hospitalizations endpoint
  const url = `/hospitalizations`;
  // Many backends expect POST; here we try POST explicitly
  try {
    const fullUrl = `${API_BASE_URL.replace(/\/+$/, "")}${url.startsWith('/') ? url : `/${url}`}`;
    const token = localStorage.getItem('d7-clinic-access-token') || localStorage.getItem('d7-clinic-api-token');
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
      body: JSON.stringify(admission),
    });
    if (!response.ok) throw new Error('Admission save failed');
    return await response.json();
  } catch (e) {
    // fallback simulated save for offline
    const saved = { ...admission, id: `adm-${Date.now()}` };
    const key = "mock_admissions";
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      arr.unshift(saved);
      localStorage.setItem(key, JSON.stringify(arr));
    } catch {}
    return saved;
  }
};

export const uploadFileMock = async (file: File) => {
  // Return an object URL to simulate server-stored file
  return { name: file.name, url: URL.createObjectURL(file), size: file.size };
};

// ---- Patient storage + messaging (simple localStorage-backed simulation) ----
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
  service?: string;
  firstName?: string;
  lastName?: string;
  doctor?: string;
  workflowStatus?: string;
  priority?: string;
  insurance?: { company?: string; policy?: string; coverageType?: string; coveragePct?: number; photo?: any; pdf?: any };
  contacts?: Array<{ name: string; relation: string; phone: string; address: string }>;
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

const PATIENTS_KEY = "d7-clinic-patients";
const CONVERSATIONS_KEY = "d7-clinic-conversations";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const getAuthHeaders = (): Record<string, string> => {
  try {
    const token =
      localStorage.getItem("d7-clinic-access-token") ||
      localStorage.getItem("d7-clinic-auth-token") ||
      localStorage.getItem("d7-clinic-api-token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const fetchDbJson = async <T>(path: string): Promise<T> => {
  const url = `${API_BASE_URL.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
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
    const token = localStorage.getItem('d7-clinic-access-token') || localStorage.getItem('d7-clinic-api-token');
    const response = await fetch(fullUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (response.ok) return (await response.json()) as PatientRecord;
  } catch {}

  try {
    const raw = localStorage.getItem(PATIENTS_KEY);
    const store: PatientRecord[] = raw ? JSON.parse(raw) : [];
    const idx = store.findIndex((patient) => patient.id === payload.id);
    if (idx < 0) return null;
    const updated: PatientRecord = {
      ...store[idx],
      ...payload,
      relations: payload.relations ?? store[idx].relations,
      insurance: payload.insurance ?? store[idx].insurance,
      contacts: payload.contacts ?? store[idx].contacts,
      allergies: payload.allergies ?? store[idx].allergies,
    };
    store[idx] = updated;
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(store));
    dispatchPatientRecordsUpdated();
    return updated;
  } catch {
    return null;
  }
};

export const getPatientById = (id: string): PatientRecord | null => {
  try {
    // try backend first
    // eslint-disable-next-line no-async-promise-executor
    // Note: synchronous signature preserved for compatibility; callers should use fetchPatientsFromDatabase when possible
    const raw = localStorage.getItem(PATIENTS_KEY);
    const store: PatientRecord[] = raw ? JSON.parse(raw) : [];
    return store.find((patient) => patient.id === id) || null;
  } catch {
    return null;
  }
};

export const createPatientAdmission = async (payload: Partial<PatientRecord>): Promise<PatientRecord> => {
  const url = `/public/patients/admissions`;
  const fullUrl = `${API_BASE_URL.replace(/\/+$/, "")}${url.startsWith('/') ? url : `/${url}`}`;
  const response = await fetch(fullUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Admission failed (${response.status}): ${errorBody}`);
  }
  return (await response.json()) as PatientRecord;
};

export const addPatientRelation = (patientId: string, relatedPatient: PatientRelation) => {
  try {
    const raw = localStorage.getItem(PATIENTS_KEY);
    const store: PatientRecord[] = raw ? JSON.parse(raw) : [];
    const idx = store.findIndex((item) => item.id === patientId);
    if (idx < 0) return;

    const patient = store[idx];
    const alreadyLinked = patient.relations?.some((relation) => relation.patientId === relatedPatient.patientId);
    const relations = alreadyLinked
      ? patient.relations
      : [...(patient.relations || []), relatedPatient];

    store[idx] = { ...patient, relations };
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
};

export type Conversation = {
  id: string;
  patientId: string;
  patientName: string;
  messages: Array<{ id: string | number; from: "Patient" | "Staff"; text: string; time: string; read?: boolean }>;
  updatedAt: string;
};

export const createConversationForPatient = (patient: PatientRecord): Conversation => {
  // Try backend notifications as conversation substitute
  const conv: Conversation = {
    id: `conv-${Date.now()}`,
    patientId: patient.id,
    patientName: patient.name,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  try {
    const url = `/notifications`;
    const fullUrl = `${API_BASE_URL.replace(/\/+$/, "")}${url.startsWith('/') ? url : `/${url}`}`;
    const token = localStorage.getItem('d7-clinic-access-token') || localStorage.getItem('d7-clinic-api-token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    fetch(fullUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ title: `Conversation ${patient.name}`, message: 'Conversation créée', patientId: patient.id }),
    }).catch(() => {});
  } catch {}
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    const arr: Conversation[] = raw ? JSON.parse(raw) : [];
    arr.unshift(conv);
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(arr));
  } catch {}
  return conv;
};

export const addMessageToConversation = (convId: string, msg: { from: "Patient" | "Staff"; text: string }) => {
  const message = { id: Date.now(), from: msg.from, text: msg.text, time: new Date().toLocaleTimeString(), read: false };
  try {
    const url = `/notifications`;
    const fullUrl = `${API_BASE_URL.replace(/\/+$/, "")}${url.startsWith('/') ? url : `/${url}`}`;
    const token = localStorage.getItem('d7-clinic-access-token') || localStorage.getItem('d7-clinic-api-token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    fetch(fullUrl, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ title: `Message conv ${convId}`, message: msg.text }),
    }).catch(() => {});
  } catch {}
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    const arr: Conversation[] = raw ? JSON.parse(raw) : [];
    const idx = arr.findIndex((c) => c.id === convId);
    if (idx >= 0) {
      arr[idx].messages.push(message);
      arr[idx].updatedAt = new Date().toISOString();
    } else {
      const conv: Conversation = {
        id: convId,
        patientId: 'unknown',
        patientName: msg.from === 'Patient' ? 'Patient' : 'Staff',
        messages: [message],
        updatedAt: new Date().toISOString(),
      };
      arr.unshift(conv);
    }
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(arr));

    try {
      localStorage.setItem('d7-last-incoming', JSON.stringify({ convId, message }));
      localStorage.setItem('d7-has-unread', 'true');
    } catch {}

    try {
      window.dispatchEvent(new CustomEvent('d7:incomingMessage', { detail: { convId, message } }));
    } catch {}
    return message;
  } catch (e) {
    return { id: Date.now(), from: msg.from, text: msg.text, time: new Date().toLocaleTimeString() };
  }
};

export const getConversations = (): Conversation[] => {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const getUnreadFlag = () => {
  try {
    return localStorage.getItem("d7-has-unread") === "true";
  } catch {
    return false;
  }
};

export const clearUnreadFlag = () => {
  try {
    localStorage.removeItem("d7-has-unread");
    localStorage.removeItem("d7-last-incoming");
  } catch {}
};
