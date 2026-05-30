export type PatientSummary = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  dob?: string;
};

const SAMPLE_PATIENTS: PatientSummary[] = [
  { id: "p-001", name: "Sarah Ilunga", phone: "+243812345678", dob: "1990-05-12" },
  { id: "p-002", name: "Jean Kabila", phone: "+243820112233", dob: "1982-11-02" },
];

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
  return fetchDbJson<PatientRecord[]>("/patients");
};

export const fetchAppointmentsFromDatabase = async () => {
  return fetchDbJson<Array<{ priority?: string; status?: string; scheduledAt?: string; requestedAt?: string; createdAt?: string }>>("/appointments");
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

export const findPatientByName = async (name: string) => {
  const normalizedName = normalizePatientName(name);
  if (!normalizedName) return null;

  const stored = getStoredPatients().find((p) => normalizePatientName(p.name) === normalizedName);
  if (stored) return stored;

  return SAMPLE_PATIENTS.find((p) => normalizePatientName(p.name) === normalizedName) || null;
};

export const findPatientByPhone = async (phone: string) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const stored = getStoredPatients().find((p) => p.phone && normalizePhone(p.phone).includes(normalized));
  if (stored) return stored;
  return SAMPLE_PATIENTS.find((p) => p.phone && normalizePhone(p.phone).includes(normalized)) || null;
};

export const findPatientByEmail = async (email: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const stored = getStoredPatients().find((p) => p.email && normalizeEmail(p.email) === normalized);
  if (stored) return stored;
  return SAMPLE_PATIENTS.find((p) => p.email && normalizeEmail(p.email) === normalized) || null;
};

export const findPatientByCredentials = (identifier: string, password: string) => {
  const normalized = identifier.trim().toLowerCase();
  return getStoredPatients().find((patient) =>
    patient.password === password &&
    (patient.matricule.toLowerCase() === normalized || (patient.email && patient.email.toLowerCase() === normalized))
  ) || null;
};

export const saveAdmission = async (admission: any) => {
  // Simulate saving — in a real app POST to backend
  const saved = { ...admission, id: `adm-${Date.now()}` };
  const key = "mock_admissions";
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift(saved);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {
    // ignore
  }
  return saved;
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
  doctor?: string;
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

const getAuthHeaders = () => {
  try {
    const token = localStorage.getItem("d7-clinic-auth-token") || localStorage.getItem("d7-clinic-api-token");
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

export const updatePatientRecord = (payload: Partial<PatientRecord> & { id: string }): PatientRecord | null => {
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
    const raw = localStorage.getItem(PATIENTS_KEY);
    const store: PatientRecord[] = raw ? JSON.parse(raw) : [];
    return store.find((patient) => patient.id === id) || null;
  } catch {
    return null;
  }
};

export const savePatientRecord = (payload: Partial<PatientRecord>): PatientRecord => {
  try {
    const raw = localStorage.getItem(PATIENTS_KEY);
    const store: PatientRecord[] = raw ? JSON.parse(raw) : [];
    const normalizedName = normalizePatientName(payload.name || "");
    const existing = store.find((patient) => normalizePatientName(patient.name) === normalizedName);
    if (existing) {
      const merged: PatientRecord = {
        ...existing,
        ...payload,
        relations: payload.relations ?? existing.relations,
        insurance: payload.insurance ?? existing.insurance,
        contacts: payload.contacts ?? existing.contacts,
        allergies: payload.allergies ?? existing.allergies,
      };
      const idx = store.findIndex((item) => item.id === existing.id);
      store[idx] = merged;
      localStorage.setItem(PATIENTS_KEY, JSON.stringify(store));
      dispatchPatientRecordsUpdated();
      return merged;
    }

    const id = payload.id || `patient-${Date.now()}`;
    const names = (payload.name || "Patient").trim().split(/\s+/);
    const firstName = names[0] || "P";
    const lastName = names.length > 1 ? names[names.length - 1] : firstName;
    const initials = `${lastName[0] || "X"}${firstName[0] || "X"}`.toUpperCase();
    const suffix = id.slice(-6);
    const matricule = payload.matricule || `P-${suffix}`;
    const password = payload.password || `d7P-${initials}-${suffix}`;
    const rec: PatientRecord = {
      id,
      matricule,
      password,
      name: payload.name || "Patient",
      phone: payload.phone,
      email: payload.email,
      dob: payload.dob,
      gender: payload.gender,
      createdAt: payload.createdAt || new Date().toISOString(),
      relations: payload.relations || [],
      admissionType: payload.admissionType,
      arrival: payload.arrival,
      receptionist: payload.receptionist,
      service: payload.service,
      doctor: payload.doctor,
      priority: payload.priority,
      insurance: payload.insurance,
      contacts: payload.contacts || [],
      allergies: payload.allergies || [],
      status: payload.status || "Enregistré",
      amountDue: payload.amountDue,
      paymentRequestId: payload.paymentRequestId,
      paymentStatus: payload.paymentStatus,
      paymentMethod: payload.paymentMethod,
      temperature: payload.temperature,
      bloodPressure: payload.bloodPressure,
      spo2: payload.spo2,
      heartRate: payload.heartRate,
      nextAction: payload.nextAction,
      lastUpdate: payload.lastUpdate,
      avatar: payload.avatar,
    };
    store.unshift(rec);
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(store));
    dispatchPatientRecordsUpdated();
    return rec;
  } catch (e) {
    // fallback
    const id = payload.id || `patient-${Date.now()}`;
    const names = (payload.name || "Patient").trim().split(/\s+/);
    const firstName = names[0] || "P";
    const lastName = names.length > 1 ? names[names.length - 1] : firstName;
    const initials = `${lastName[0] || "X"}${firstName[0] || "X"}`.toUpperCase();
    const suffix = id.slice(-6);
    return {
      id,
      matricule: payload.matricule || `P-${suffix}`,
      password: payload.password || `d7P-${initials}-${suffix}`,
      name: payload.name || "Patient",
      phone: payload.phone,
      email: payload.email,
      dob: payload.dob,
      gender: payload.gender,
      relations: payload.relations || [],
      createdAt: new Date().toISOString(),
      admissionType: payload.admissionType,
      arrival: payload.arrival,
      receptionist: payload.receptionist,
      service: payload.service,
      doctor: payload.doctor,
      priority: payload.priority,
      insurance: payload.insurance,
      contacts: payload.contacts || [],
      allergies: payload.allergies || [],
      status: payload.status || "Enregistré",
      amountDue: payload.amountDue,
      paymentRequestId: payload.paymentRequestId,
      paymentStatus: payload.paymentStatus,
      paymentMethod: payload.paymentMethod,
      temperature: payload.temperature,
      bloodPressure: payload.bloodPressure,
      spo2: payload.spo2,
      heartRate: payload.heartRate,
      nextAction: payload.nextAction,
      lastUpdate: payload.lastUpdate,
      avatar: payload.avatar,
    };
  }
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
  const conv: Conversation = {
    id: `conv-${Date.now()}`,
    patientId: patient.id,
    patientName: patient.name,
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    const arr: Conversation[] = raw ? JSON.parse(raw) : [];
    arr.unshift(conv);
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(arr));
  } catch (e) {
    // ignore
  }
  return conv;
};

export const addMessageToConversation = (convId: string, msg: { from: "Patient" | "Staff"; text: string }) => {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    const arr: Conversation[] = raw ? JSON.parse(raw) : [];
    const idx = arr.findIndex((c) => c.id === convId);
    const message = { id: Date.now(), from: msg.from, text: msg.text, time: new Date().toLocaleTimeString(), read: false };
    if (idx >= 0) {
      arr[idx].messages.push(message);
      arr[idx].updatedAt = new Date().toISOString();
    } else {
      // create a fallback conversation
      const conv: Conversation = {
        id: convId,
        patientId: "unknown",
        patientName: msg.from === "Patient" ? "Patient" : "Staff",
        messages: [message],
        updatedAt: new Date().toISOString(),
      };
      arr.unshift(conv);
    }
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(arr));

    // store a small last-incoming pointer for UI notifications
    try {
      localStorage.setItem("d7-last-incoming", JSON.stringify({ convId, message }));
      localStorage.setItem("d7-has-unread", "true");
    } catch {}

    // emit global event for listeners
    try {
      window.dispatchEvent(new CustomEvent("d7:incomingMessage", { detail: { convId, message } }));
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
