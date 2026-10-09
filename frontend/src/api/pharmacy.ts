import { apiFetch } from '../config/api';

export type PharmacyPrescriptionLine = {
  id: string;
  medicationId: string;
  medication?: { name?: string | null; unit?: string | null; strength?: string | null } | null;
  dosage: string;
  frequency: string;
  quantity: number;
  notes?: string | null;
};

export type PharmacyPrescription = {
  id: string;
  status: string;
  prescribingDate: string;
  instruction?: string | null;
  patient?: { firstName?: string | null; lastName?: string | null; displayId?: string | null } | null;
  prescriber?: { displayName?: string | null } | null;
  lineItems?: PharmacyPrescriptionLine[];
};

export const fetchPrescriptions = () => apiFetch<PharmacyPrescription[]>('/pharmacy/prescriptions');

export const fetchReadyPrescriptions = () => apiFetch<PharmacyPrescription[]>('/pharmacy/prescriptions/ready');

export type MedicationSalePrice = {
  medicationId: string;
  amount: string;
  currency: 'CDF';
  updatedAt: string;
};

export const fetchMedicationSalePrice = (medicationId: string) =>
  apiFetch<MedicationSalePrice | null>(`/pharmacy/medications/${medicationId}/sale-price`);

export const setMedicationSalePrice = (medicationId: string, amount: string) =>
  apiFetch<MedicationSalePrice>(`/pharmacy/medications/${medicationId}/sale-price`, {
    method: 'PUT',
    body: JSON.stringify({ amount }),
  });

export const dispensePrescription = (
  prescriptionId: string, 
  body: { notes?: string; location?: string } = {}
) =>
  apiFetch(`/pharmacy/prescriptions/${prescriptionId}/dispense`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

export const createIndependentSale = (payload: Record<string, unknown>) =>
  apiFetch('/pharmacy/sales', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export type PharmacyHistoryRecord = {
  id: string;
  type: 'DISPENSE' | 'SALE';
  typeLabel: string;
  createdAt: string;
  patientName: string;
  medicationName: string;
  quantity: number;
  amount: number;
  reference: string;
  actorName: string;
  status: string;
  notes?: string | null;
  trace: string;
};

export const fetchPharmacyHistory = () => apiFetch<PharmacyHistoryRecord[]>('/pharmacy/history');
