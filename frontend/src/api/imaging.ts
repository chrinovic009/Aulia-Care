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

export const fetchImagingCatalogue = () => apiFetch<ImagingCatalogueItem[]>('/imaging/catalogue');
export const fetchImagingMachines = () => apiFetch<ImagingMachine[]>('/imaging/machines');
export const createImagingMachine = (payload: { name: string; roomNumber?: string; isOperational?: boolean }) =>
  apiFetch('/imaging/machines', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
