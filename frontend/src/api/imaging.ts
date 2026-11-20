import { apiFetch } from "../config/api";

export type ImagingCatalogueItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  modality: string;
  preparationInstructions?: string | null;
  category?: string | null;
  availableIncidences: string[];
  supportsContrast: boolean;
  price: string;
  turnaroundTimeMinutes?: number | null;
  active: boolean;
};

export type ImagingMachine = {
  id: string;
  name: string;
  roomNumber?: string | null;
  isOperational: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ImagingReport = {
  id: string;
  findings: string;
  impression: string;
  recommendations?: string | null;
  verified: boolean;
  version: number;
  imagePaths: string[];
  dicomStudyInstanceUid?: string | null;
};

export type ImagingRequestItem = {
  id: string;
  status: string;
  modality: string;
  bodyPart: string;
  patient: { id: string; firstName: string; lastName: string; externalId?: string | null };
  imagingCatalogue?: { name: string } | null;
  report?: ImagingReport | null;
};

export const fetchImagingCatalogue = () => apiFetch<ImagingCatalogueItem[]>('/imaging/catalogue');
export const fetchImagingMachines = () => apiFetch<ImagingMachine[]>('/imaging/machines');
export const createImagingMachine = (payload: { name: string; roomNumber?: string; isOperational?: boolean }) =>
  apiFetch('/imaging/machines', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const saveImagingReport = (id: string, payload: { findings: string; impression: string; recommendations?: string; verified: boolean }) =>
  apiFetch<ImagingReport>(`/imaging/${encodeURIComponent(id)}/report`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const uploadImagingPreview = (id: string, file: File) => {
  const body = new FormData();
  body.append('file', file, file.name);
  return apiFetch<ImagingReport>(`/imaging/${encodeURIComponent(id)}/report/previews`, { method: 'POST', body }, 30000);
};
