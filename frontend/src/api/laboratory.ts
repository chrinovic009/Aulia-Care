import { apiFetch } from "../config/api";
export { apiFetch }; // <-- Cette ligne permet d'autoriser d'autres fichiers à l'importer depuis laboratory.ts

export type LabRequestSummary = {
  id: string;
  status: string;
  priority?: string | null;
  requestedAt: string;
  specimenType?: string | null;
  patient?: { firstName?: string | null; lastName?: string | null };
  requestedBy?: { displayName?: string | null; firstName?: string | null; lastName?: string | null };
  consultation?: { provider?: { displayName?: string | null; firstName?: string | null; lastName?: string | null } | null } | null;
  results?: Array<{ resultName: string; resultValue: string; units?: string | null; interpretation?: string | null; reportedAt: string }>;
};

export const fetchLaboratoryRequests = () => apiFetch<LabRequestSummary[]>("/laboratory");

export const fetchLaboratoryRequest = (id: string) => apiFetch<LabRequestSummary>(`/laboratory/${id}`);

export type LabCataloguePayload = {
  sections: Array<{ id: string; name: string; description?: string | null; active: boolean; order: number; categories: Array<{ id: string }>; tests: Array<{ id: string }> }>;
  categories: Array<{ id: string; sectionId?: string | null; name: string; code?: string | null; description?: string | null; active: boolean; order: number; section?: { id: string; name: string } | null; tests: Array<{ id: string }> }>;
  tests: Array<{
    id: string;
    code: string;
    name: string;
    description?: string | null;
    price: string;
    turnaroundTimeMinutes?: number | null;
    resultType: string;
    unit?: string | null;
    referenceRange?: string | null;
    genderRestriction: string;
    minAge?: number | null;
    maxAge?: number | null;
    active: boolean;
    categoryId: string;
    sectionId?: string | null;
    category?: { id: string; name: string } | null;
    section?: { id: string; name: string } | null;
    parameterTemplates: Array<{
      id: string;
      code: string;
      name: string;
      unit?: string | null;
      resultType: string;
      referenceRange?: string | null;
      minValue?: string | null;
      maxValue?: string | null;
      active: boolean;
      order: number;
    }>;
    sampleRequirements: Array<{
      id: string;
      labSampleTypeId: string;
      labSampleType: { id: string; name: string };
      volumeRequired?: string | null;
      volumeUnit?: string | null;
      storageCondition?: string | null;
      maxAgeMinutes?: number | null;
      instructions?: string | null;
    }>;
    consumableRequirements: Array<{
      id: string;
      labConsumableId: string;
      labConsumable: {
        id: string;
        name: string;
        code: string;
        unit: string;
        active: boolean;
        stock: Array<{ id: string; quantity: string; minimumLevel?: string | null; criticalLevel?: string | null; location?: string | null }>;
      };
      quantity: string;
      unit?: string | null;
    }>;
  }>;
  sampleTypes: Array<{
    id: string;
    name: string;
    description?: string | null;
    active: boolean;
    sampleRequirements: Array<{
      id: string;
      labTestId: string;
      labTest: { id: string; code: string; name: string };
      volumeRequired?: string | null;
      volumeUnit?: string | null;
      storageCondition?: string | null;
      maxAgeMinutes?: number | null;
      instructions?: string | null;
    }>;
  }>;
  consumables: Array<{
    id: string;
    name: string;
    code: string;
    description?: string | null;
    unit: string;
    active: boolean;
    stock: Array<{ id: string; quantity: string; minimumLevel?: string | null; criticalLevel?: string | null; location?: string | null }>;
  }>;
};

export const fetchLaboratoryCatalogue = () => apiFetch<LabCataloguePayload>('/laboratory/catalogue');

export type LabActivityPayload = {
  totalRequests: number;
  pendingRequests: number;
  validationQueueCount: number;
  technicalValidationCount: number;
  biologicalValidationCount: number;
  sampleCollectedCount: number;
  sampleReceivedCount: number;
  technicianWorkloads: Array<{ technician: string; assignedItems: number; openItems: number }>;
  lowStockAlerts: Array<{ consumableName: string; location: string; quantity: string; minimumLevel: string | null; criticalLevel: string | null }>;
  criticalAlerts: Array<{ title: string; message: string; priority: string; createdAt: string; displayId?: string }>;
  recentRequests: Array<{ id: string; displayId: string; patientName: string; status: string; priority: string; requestedAt: string; assignedTo?: string | null; specimenType: string }>;
  directResultAuthorizationEnabled: boolean;
};

export const fetchLaboratoryActivity = () => apiFetch<LabActivityPayload>('/laboratory/activity');

export type LabSettingsPayload = {
  technicianDirectRelease: boolean;
};

export const fetchLaboratorySettings = () => apiFetch<LabSettingsPayload>('/laboratory/settings');

export const updateLaboratorySettings = (payload: LabSettingsPayload) =>
  apiFetch<LabSettingsPayload>('/laboratory/settings', { method: 'POST', body: JSON.stringify(payload) });

const serializeLabPayload = <T extends Record<string, any>>(payload: T) => ({
  ...payload,
  ...(payload.order !== undefined ? { order: payload.order === '' ? undefined : String(payload.order) } : {}),
  ...(payload.price !== undefined ? { price: String(payload.price) } : {}),
  ...(payload.turnaroundTimeMinutes !== undefined ? { turnaroundTimeMinutes: payload.turnaroundTimeMinutes === '' ? undefined : String(payload.turnaroundTimeMinutes) } : {}),
  ...(payload.minAge !== undefined ? { minAge: payload.minAge === '' ? undefined : String(payload.minAge) } : {}),
  ...(payload.maxAge !== undefined ? { maxAge: payload.maxAge === '' ? undefined : String(payload.maxAge) } : {}),
  ...(payload.volumeRequired !== undefined ? { volumeRequired: payload.volumeRequired === '' ? undefined : String(payload.volumeRequired) } : {}),
  ...(payload.maxAgeMinutes !== undefined ? { maxAgeMinutes: payload.maxAgeMinutes === '' ? undefined : String(payload.maxAgeMinutes) } : {}),
  ...(payload.quantity !== undefined ? { quantity: String(payload.quantity) } : {}),
  ...(payload.minimumLevel !== undefined ? { minimumLevel: payload.minimumLevel === '' ? undefined : String(payload.minimumLevel) } : {}),
  ...(payload.criticalLevel !== undefined ? { criticalLevel: payload.criticalLevel === '' ? undefined : String(payload.criticalLevel) } : {}),
});

export const createLabSection = (payload: { name: string; description?: string; order?: number | string; active?: boolean }) =>
  apiFetch('/laboratory/catalogue/sections', { method: 'POST', body: JSON.stringify(serializeLabPayload(payload)) });

export const createLabCategory = (payload: { sectionId?: string; name: string; code?: string; description?: string; order?: number | string; active?: boolean }) =>
  apiFetch('/laboratory/catalogue/categories', { method: 'POST', body: JSON.stringify(serializeLabPayload(payload)) });

export const createLabTest = (payload: {
  code: string;
  name: string;
  categoryId: string;
  sectionId?: string;
  description?: string;
  price: number | string;
  turnaroundTimeMinutes?: number;
  resultType: string;
  unit?: string;
  referenceRange?: string;
  genderRestriction?: string;
  minAge?: number;
  maxAge?: number;
  active?: boolean;
}) => apiFetch('/laboratory/catalogue/tests', { method: 'POST', body: JSON.stringify(serializeLabPayload(payload)) });

export const createLabTestParameter = (payload: {
  labTestId: string;
  code: string;
  name: string;
  unit?: string;
  resultType?: string;
  referenceRange?: string;
  minValue?: string;
  maxValue?: string;
  order?: number;
  active?: boolean;
}) => apiFetch('/laboratory/catalogue/test-parameters', { method: 'POST', body: JSON.stringify(serializeLabPayload(payload)) });

export const createLabSampleType = (payload: { name: string; labTestId?: string; description?: string; active?: boolean }) =>
  apiFetch('/laboratory/catalogue/sample-types', { method: 'POST', body: JSON.stringify(payload) });

export const createLabTestSampleRequirement = (payload: {
  labTestId: string;
  labSampleTypeId: string;
  volumeRequired?: number;
  volumeUnit?: string;
  storageCondition?: string;
  maxAgeMinutes?: number;
  instructions?: string;
}) => apiFetch('/laboratory/catalogue/sample-requirements', { method: 'POST', body: JSON.stringify(serializeLabPayload(payload)) });

export const createLabConsumable = (payload: { name: string; code: string; description?: string; unit: string; active?: boolean }) =>
  apiFetch('/laboratory/catalogue/consumables', { method: 'POST', body: JSON.stringify(payload) });

export const createLabTestConsumableRequirement = (payload: {
  labTestId: string;
  labConsumableId: string;
  quantity: number;
  unit?: string;
}) => apiFetch('/laboratory/catalogue/consumable-requirements', { method: 'POST', body: JSON.stringify(serializeLabPayload(payload)) });

export const createLabConsumableStock = (payload: {
  labConsumableId: string;
  quantity: number;
  minimumLevel?: number;
  criticalLevel?: number;
  location?: string;
}) => apiFetch('/laboratory/catalogue/stock', { method: 'POST', body: JSON.stringify(serializeLabPayload(payload)) });

export type LabCatalogueKind = 'sections' | 'categories' | 'tests' | 'sample-types' | 'consumables';

export const updateLabCatalogueItem = (kind: LabCatalogueKind, id: string, payload: Record<string, unknown>) =>
  apiFetch(`/laboratory/catalogue/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(serializeLabPayload(payload)) });

export const deleteLabCatalogueItem = (kind: LabCatalogueKind, id: string) =>
  apiFetch(`/laboratory/catalogue/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
