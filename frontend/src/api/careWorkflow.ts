import { apiFetch } from "../config/api";
import { sendOrQueue, type QueuedResult } from "../offline/offlineQueue";

export type CareUnitKind = "EMERGENCY" | "AMBULANCE" | "SURGERY" | "MATERNITY" | "NEONATAL" | "DIALYSIS" | "HOSPITALIZATION" | "CONSULTATION" | "LABORATORY" | "IMAGING" | "PHARMACY" | "OTHER";
export type CareUnitRole = "MEMBER" | "LEAD" | "READ_ONLY";
export type CarePriority = "ROUTINE" | "URGENT" | "ASAP" | "STAT";
export type EpisodeStatus = "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED" | "ENTERED_IN_ERROR";
export type RequestStatus = "DRAFT" | "ACTIVE" | "ON_HOLD" | "REVOKED" | "COMPLETED" | "ENTERED_IN_ERROR";
export type TaskStatus = "REQUESTED" | "RECEIVED" | "ACCEPTED" | "REJECTED" | "READY" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED" | "FAILED";
export type TransferStatus = "SENT" | "RECEIVED" | "ACCEPTED" | "REJECTED" | "CANCELLED";

export type TriageLevel = { code: string; label: string; color?: string; priority?: CarePriority; maxWaitMinutes?: number };
export type UnitSettings = {
  stages?: string[];
  triageScale?: TriageLevel[];
  triageScaleValidated?: boolean;
  locations?: string[];
  closureRequirements?: Array<{ eventType: string; label?: string }>;
  outcomes?: Array<{ code: string; label: string }>;
  [key: string]: unknown;
};
export type CareUnit = { id: string; kind: CareUnitKind; code: string; name: string; settings?: UnitSettings | null; active?: boolean };
export type PatientSummary = {
  id: string; firstName: string; lastName: string; middleName?: string | null; dateOfBirth?: string | null; gender?: string | null;
  identityStatus?: "CONFIRMED" | "PROVISIONAL" | "MERGED"; dateOfBirthEstimated?: boolean; externalId?: string | null; phone?: string | null;
};
export type UserSummary = { id: string; firstName?: string; lastName?: string; primaryRole?: string };

export type CareEpisode = {
  id: string; careUnitId: string; patientId: string; status: EpisodeStatus; stage?: string | null; priority: CarePriority;
  reason?: string | null; locationLabel?: string | null; startedAt?: string | null; endedAt?: string | null; createdAt: string;
  outcome?: string | null; version: number; responsibleUserId?: string | null;
  patient: PatientSummary; responsible?: UserSummary | null;
  /** Latest TRIAGE / MISSION_STEP events and engaged resources, in worklists. */
  events?: Array<{ id: string; type?: string; payload?: Record<string, unknown> | null; occurredAt: string }>;
  resources?: Array<{ id: string; kind: CareResourceKind; code: string; label: string }>;
};
export type CareTask = {
  id: string; status: TaskStatus; priority: CarePriority; title: string; description?: string | null; dueAt?: string | null; createdAt: string;
  version: number; patient?: PatientSummary | null; owner?: UserSummary | null; request?: { id: string; label: string; category: string; code: string } | null;
};
export type CareTransfer = {
  id: string; status: TransferStatus; reason: string; summary: Record<string, unknown>; sentAt: string; version: number;
  patient: PatientSummary; sender?: UserSummary | null; fromUnit?: { id: string; name: string; kind: CareUnitKind } | null;
  toUnit?: { id: string; name: string } | null; toEpisodeId?: string | null;
};
export type ServiceRequest = {
  id: string; status: RequestStatus; priority: CarePriority; category: string; code: string; label: string; reason?: string | null;
  authoredAt: string; version: number; patient?: PatientSummary; requester?: UserSummary | null; requesterUnit?: { id: string; name: string } | null;
  performerUnit?: { id: string; name: string } | null; performerUnitId?: string;
  tasks?: Array<Pick<CareTask, "id" | "status" | "version">>; events?: Array<{ id: string }>;
};
export type CareEvent = {
  id: string; type: string; summary: string; payload?: Record<string, unknown> | null; occurredAt: string; recordedAt: string; requestId?: string | null;
  author?: UserSummary | null; authorRole?: string; correctsEventId?: string | null; correctionReason?: string | null;
  requiresValidation?: boolean; validatesEventId?: string | null; careUnit?: { id: string; name: string; kind: CareUnitKind } | null;
};
export type Worklist = {
  unit: CareUnit; unitRole: CareUnitRole; episodes: CareEpisode[]; tasks: CareTask[];
  incomingTransfers: CareTransfer[]; incomingRequests: ServiceRequest[]; outgoingRequests: ServiceRequest[]; generatedAt: string;
};
export type EpisodeDetail = Omit<CareEpisode, "events"> & {
  careUnit: CareUnit; requests: ServiceRequest[]; tasks: CareTask[]; events: CareEvent[];
  transfersOut: CareTransfer[]; transfersIn: CareTransfer[];
};

const post = <T,>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const base = "/care-workflow";

export const fetchMyUnits = () => apiFetch<Array<{ unitRole: CareUnitRole; careUnit: CareUnit }>>(`${base}/my-units`);
export const fetchClinicUnits = () => apiFetch<CareUnit[]>(`${base}/units`);
export const fetchWorklist = (unitId: string) => apiFetch<Worklist>(`${base}/units/${unitId}/worklist`);
export const fetchUnitHistory = (unitId: string, days = 7) => apiFetch<CareEpisode[]>(`${base}/units/${unitId}/history?days=${days}`);
export const fetchEpisode = (episodeId: string) => apiFetch<EpisodeDetail>(`${base}/episodes/${episodeId}`);
export const fetchPatientTimeline = (patientId: string) => apiFetch<CareEvent[]>(`${base}/patients/${patientId}/timeline`);
/** Laboratory catalogue: an exam asked of a LABORATORY unit is chosen here (it carries the billed price). */
export type LabCatalogueItem = { id: string; code: string; name: string; price: string | number | null };
export const fetchLaboratoryCatalogue = () => apiFetch<LabCatalogueItem[]>(`${base}/catalogue/laboratory`);
/** Imaging catalogue: same rule for an exam asked of an IMAGING unit. */
export const fetchImagingCatalogue = () => apiFetch<Array<LabCatalogueItem & { modality?: string }>>(`${base}/catalogue/imaging`);
export const searchCarePatients = (q: string) => apiFetch<PatientSummary[]>(`${base}/patients/search?q=${encodeURIComponent(q)}`);

export const registerArrival = (unitId: string, body: {
  patientId?: string; provisional?: { gender: string; estimatedAgeYears?: number; description?: string };
  reason?: string; arrivalMode?: string; locationLabel?: string; arrivedAt?: string;
}) => post<CareEpisode>(`${base}/units/${unitId}/arrivals`, body);
export const mergeProvisionalPatient = (patientId: string, targetPatientId: string, reason: string) =>
  post<{ movedEpisodes: number }>(`${base}/patients/${patientId}/merge`, { targetPatientId, reason });

export const openEpisode = (body: { careUnitId: string; patientId: string; priority?: CarePriority; reason?: string; stage?: string; start?: boolean; sourceRequestId?: string }) =>
  post<CareEpisode>(`${base}/episodes`, body);
export const updateEpisode = (episodeId: string, body: { version: number; stage?: string; priority?: CarePriority; locationLabel?: string; responsibleUserId?: string | null; releaseResponsible?: boolean; reason?: string }) =>
  apiFetch<CareEpisode>(`${base}/episodes/${episodeId}`, { method: "PATCH", body: JSON.stringify(body) });
export const changeEpisodeStatus = (episodeId: string, body: { version: number; status: EpisodeStatus; reason?: string; outcome?: string; outcomeDetail?: Record<string, unknown> }) =>
  post<CareEpisode>(`${base}/episodes/${episodeId}/status`, body);

export type RecordEventBody = {
  careUnitId: string; patientId?: string; episodeId?: string; requestId?: string; taskId?: string;
  type: string; summary: string; payload?: Record<string, unknown>; occurredAt?: string; requiresValidation?: boolean;
  episodeUpdate?: { version: number; stage?: string; priority?: CarePriority; locationLabel?: string };
};
/** Plain clinical documentation survives a network loss (offline queue, exactly-once replay). */
export const recordCareEvent = (body: RecordEventBody, label: string): Promise<CareEvent | QueuedResult> => {
  const payload = { ...body, occurredAt: body.occurredAt ?? new Date().toISOString() };
  // An event that also moves the stay depends on its current version: it is never queued.
  if (body.episodeUpdate) return post<CareEvent>(`${base}/events`, payload);
  return sendOrQueue<CareEvent>(label, `${base}/events`, { method: "POST", body: JSON.stringify(payload) });
};
export const correctCareEvent = (eventId: string, body: { reason: string; retract?: boolean; summary?: string; payload?: Record<string, unknown> }) =>
  post<CareEvent>(`${base}/events/${eventId}/correct`, body);
export const validateCareEvent = (eventId: string, comment?: string) => post<CareEvent>(`${base}/events/${eventId}/validate`, { comment });

export const createServiceRequest = (body: {
  patientId: string; episodeId?: string; requesterUnitId?: string; performerUnitId: string; category: string; code: string; label: string;
  reason?: string; priority?: CarePriority; details?: Record<string, unknown>; draft?: boolean;
}) => post<ServiceRequest>(`${base}/requests`, body);
export const changeRequestStatus = (requestId: string, body: { version: number; status: RequestStatus; reason?: string }) =>
  post<ServiceRequest>(`${base}/requests/${requestId}/status`, body);
export const changeTaskStatus = (taskId: string, body: { version: number; status: TaskStatus; reason?: string }) =>
  post<CareTask>(`${base}/tasks/${taskId}/status`, body);
export type ResultObservation = { name: string; value: string; unit?: string; referenceRange?: string; flag?: "NORMAL" | "LOW" | "HIGH" | "CRITICAL" | "ABNORMAL" };
export const reportTaskResult = (taskId: string, body: { version: number; summary: string; observations?: ResultObservation[]; conclusion?: string }) =>
  post<CareEvent>(`${base}/tasks/${taskId}/result`, body);
export const assignTask = (taskId: string, body: { version: number; ownerUserId?: string | null; reason?: string }) =>
  post<CareTask>(`${base}/tasks/${taskId}/assign`, body);

export const sendTransfer = (body: { patientId: string; fromUnitId?: string; fromEpisodeId?: string; toUnitId: string; requestId?: string; reason: string; summary: Record<string, unknown> }) =>
  post<CareTransfer>(`${base}/transfers`, body);
export const acknowledgeTransfer = (transferId: string, version: number) => post<CareTransfer>(`${base}/transfers/${transferId}/acknowledge`, { version });
export const decideTransfer = (transferId: string, body: { version: number; decision: "ACCEPT" | "REJECT"; reason?: string; episode?: { priority?: CarePriority; reason?: string; locationLabel?: string } }) =>
  post<CareTransfer>(`${base}/transfers/${transferId}/decision`, body);
export const cancelTransfer = (transferId: string, version: number, reason: string) => post<CareTransfer>(`${base}/transfers/${transferId}/cancel`, { version, reason });

// ----------------------------------------------------------------- resources
export type CareResourceKind = "VEHICLE" | "TEAM" | "EQUIPMENT" | "ROOM" | "MACHINE";
export type CareResourceStatus = "AVAILABLE" | "ENGAGED" | "UNAVAILABLE" | "MAINTENANCE" | "RETIRED";
export type CareResource = {
  id: string; careUnitId: string; kind: CareResourceKind; code: string; label: string; status: CareResourceStatus;
  statusReason?: string | null; assignedEpisodeId?: string | null; details?: Record<string, unknown> | null; version: number;
  assignedEpisode?: { id: string; stage?: string | null; priority: CarePriority; patient: PatientSummary } | null;
};
export const RESOURCE_STATUS_LABELS: Record<CareResourceStatus, string> = {
  AVAILABLE: "Disponible", ENGAGED: "Engagé", UNAVAILABLE: "Indisponible", MAINTENANCE: "En maintenance", RETIRED: "Retiré",
};
export const fetchResources = (unitId: string) => apiFetch<CareResource[]>(`${base}/units/${unitId}/resources`);
export const createResource = (unitId: string, body: { kind: CareResourceKind; code: string; label: string; details?: Record<string, unknown> }) =>
  post<CareResource>(`${base}/units/${unitId}/resources`, body);
export const updateResource = (resourceId: string, body: { version: number; status?: CareResourceStatus; statusReason?: string; assignedEpisodeId?: string; release?: boolean; label?: string; details?: Record<string, unknown> }) =>
  apiFetch<CareResource>(`${base}/resources/${resourceId}`, { method: "PATCH", body: JSON.stringify(body) });

// ----------------------------------------------------------------- administration
export const adminListUnits = () => apiFetch<Array<CareUnit & { _count?: { assignments: number } }>>("/care-units");
export const adminCreateUnit = (body: { kind: CareUnitKind; code: string; name: string; settings?: UnitSettings }) => post<CareUnit>("/care-units", body);
export const adminUpdateUnit = (unitId: string, body: { name?: string; active?: boolean; settings?: UnitSettings }) =>
  apiFetch<CareUnit>(`/care-units/${unitId}`, { method: "PATCH", body: JSON.stringify(body) });
export type UnitAssignment = { id: string; userId: string; unitRole: CareUnitRole; active: boolean; endsAt?: string | null; user: UserSummary & { status?: string } };
export const adminUnitAssignments = (unitId: string) => apiFetch<UnitAssignment[]>(`/care-units/${unitId}/assignments`);
export const adminUpsertAssignment = (unitId: string, body: { userId: string; unitRole: CareUnitRole; active: boolean; endsAt?: string }) =>
  apiFetch<UnitAssignment>(`/care-units/${unitId}/assignments`, { method: "PUT", body: JSON.stringify(body) });

// ----------------------------------------------------------------- labels
export const PRIORITY_LABELS: Record<CarePriority, string> = { STAT: "Immédiate", ASAP: "Très urgente", URGENT: "Urgente", ROUTINE: "Standard" };
export const PRIORITY_RANK: Record<CarePriority, number> = { STAT: 0, ASAP: 1, URGENT: 2, ROUTINE: 3 };
export const KIND_LABELS: Record<CareUnitKind, string> = {
  EMERGENCY: "Urgences", AMBULANCE: "Ambulance", SURGERY: "Chirurgie", MATERNITY: "Maternité", NEONATAL: "Néonatologie", DIALYSIS: "Dialyse",
  HOSPITALIZATION: "Hospitalisation", CONSULTATION: "Consultation", LABORATORY: "Laboratoire", IMAGING: "Imagerie", PHARMACY: "Pharmacie", OTHER: "Autre",
};
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  REQUESTED: "Demandée", RECEIVED: "Reçue", ACCEPTED: "Acceptée", REJECTED: "Refusée", READY: "Résultat disponible",
  IN_PROGRESS: "En cours", ON_HOLD: "En attente", COMPLETED: "Terminée", CANCELLED: "Annulée", FAILED: "Échec",
};
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "À valider", ACTIVE: "Demandée", ON_HOLD: "Suspendue", REVOKED: "Annulée", COMPLETED: "Clôturée", ENTERED_IN_ERROR: "Saisie en erreur",
};
export const patientName = (patient?: PatientSummary | null) =>
  patient ? `${patient.lastName ?? ""} ${patient.firstName ?? ""}`.trim() + (patient.identityStatus === "PROVISIONAL" ? " (identité provisoire)" : "") : "Patient";
export const personName = (user?: UserSummary | null) => (user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "—" : "—");
export const ageLabel = (patient?: PatientSummary | null) => {
  if (!patient?.dateOfBirth) return "";
  const birth = new Date(patient.dateOfBirth);
  if (birth.getUTCFullYear() <= 1900) return "âge inconnu";
  const years = Math.floor((Date.now() - birth.getTime()) / (365.25 * 86_400_000));
  return `${patient.dateOfBirthEstimated ? "~" : ""}${years} ans`;
};
const GENDER_LABELS: Record<string, string> = { MALE: "Homme", FEMALE: "Femme", OTHER: "Autre", UNKNOWN: "Sexe indéterminé" };
export const genderLabel = (gender?: string | null) => (gender ? GENDER_LABELS[gender.toUpperCase()] ?? gender : "");
export const minutesSince = (iso?: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000)) : 0);
export const durationLabel = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`);
export const timeLabel = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
