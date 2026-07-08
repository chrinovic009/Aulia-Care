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
  patient?: { firstName?: string | null; lastName?: string | null } | null;
  prescriber?: { displayName?: string | null } | null;
  lineItems?: PharmacyPrescriptionLine[];
};

export const fetchReadyPrescriptions = () => apiFetch<PharmacyPrescription[]>('/pharmacy/prescriptions/ready');

export const dispensePrescription = (prescriptionId: string) =>
  apiFetch(`/pharmacy/prescriptions/${prescriptionId}/dispense`, {
    method: 'POST',
  });
