import { buildUrl, getAuthHeaders } from '../config/api';

// Types
export interface CashierPatient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  workflowStatus: string;
  arrivalAt: string;
  createdAt: string;
  service: string;
  serviceId: string;
  receptionist: string;
  invoice: {
    id: string;
    totalAmount: number;
    balanceDue: number;
    status: string;
    issuedAt: string;
    dueDate: string;
  } | null;
}

export interface InvoiceDetail {
  id: string;
  patientId: string;
  patientName: string;
  patientCompany?: string | null;
  patientWorkflowStatus?: string | null;
  invoiceNumber?: string;
  type: string;
  status: string;
  totalAmount: number;
  balanceDue: number;
  issuedAt: string;
  dueDate: string;
  remarks?: string;
  payments?: Array<{
    id: string;
    amount: number;
    method: string;
    paidAt: string;
    reference?: string;
  }>;
  invoiceLines?: Array<{
    id: string;
    label: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }>;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  patientId: string;
  patientName: string;
  patientCompany?: string | null;
  invoiceId: string;
  amount: number;
  method: string;
  paidAt: string;
  reference?: string;
  cashier?: string;
  createdAt: string;
}

export interface PatientBillingSummary {
  patient: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    workflowStatus: string;
  };
  invoices: Array<{
    id: string;
    type: string;
    status: string;
    totalAmount: number;
    paidAmount: number;
    balanceDue: number;
    issuedAt: string;
    dueDate?: string;
    remarks?: string;
  }>;
  totalAmount: number;
  totalPaid: number;
  balanceDue: number;
}

// Helper function for API calls
const fetchDbJson = async <T>(path: string): Promise<T> => {
  const url = buildUrl(path.startsWith('/') ? path : `/${path}`);
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    credentials: 'include',
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Request failed (${response.status}): ${response.statusText} ${errorBody.message || ''}`);
  }
  return response.json() as Promise<T>;
};

/**
 * Récupère les patients en attente de paiement ou en attente de validation caisse
 */
export const fetchPatientsAwaitingPayment = async (): Promise<CashierPatient[]> => {
  return await fetchDbJson<CashierPatient[]>('/patients/cashier/awaiting-payment');
};

/**
 * Récupère toutes les factures depuis la base de données
 */
export const fetchAllInvoices = async (): Promise<InvoiceDetail[]> => {
  try {
    return await fetchDbJson<InvoiceDetail[]>('/billing/invoices');
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return [];
  }
};

/**
 * Récupère tous les paiements depuis la base de données
 */
export const fetchAllPayments = async (): Promise<PaymentRecord[]> => {
  return await fetchDbJson<PaymentRecord[]>('/payments');
};

/**
 * Crée un paiement
 */
export const createPayment = async (data: {
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string;
}): Promise<PaymentRecord> => {
  try {
    const url = buildUrl('/payments');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(`Payment creation failed (${response.status}): ${response.statusText} ${errorBody.message || ''}`);
    }
    return response.json() as Promise<PaymentRecord>;
  } catch (error) {
    console.error('Error creating payment:', error);
    throw error;
  }
};

/**
 * Met à jour le statut du patient dans le workflow
 */
export const updatePatientWorkflowStatus = async (
  patientId: string,
  newStatus: string
): Promise<void> => {
  try {
    const url = buildUrl(`/patients/${patientId}`);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify({ workflowStatus: newStatus }),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(`Update failed (${response.status}): ${response.statusText} ${errorBody.message || ''}`);
    }
  } catch (error) {
    console.error('Error updating patient workflow status:', error);
    throw error;
  }
};

/**
 * Récupère les détails d'une facture
 */
export const fetchInvoiceDetail = async (invoiceId: string): Promise<InvoiceDetail> => {
  try {
    // Note: This endpoint might not exist, check backend implementation
    return await fetchDbJson<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
  } catch (error) {
    console.error('Error fetching invoice detail:', error);
    throw error;
  }
};

export const fetchPatientBillingSummary = async (patientId: string): Promise<PatientBillingSummary> => {
  return fetchDbJson<PatientBillingSummary>(`/billing/patients/${patientId}/summary`);
};

export const applyInvoiceDiscount = async (
  invoiceId: string,
  amount: number,
  reason?: string
): Promise<InvoiceDetail> => {
  const url = buildUrl(`/billing/invoices/${invoiceId}/discount`);
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify({ amount, reason }),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Discount failed (${response.status}): ${response.statusText} ${errorBody.message || ''}`);
  }
  return response.json() as Promise<InvoiceDetail>;
};

export const authorizePatientDischarge = async (patientId: string) => {
  const url = buildUrl(`/billing/patients/${patientId}/authorize-discharge`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    credentials: 'include',
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Authorization failed (${response.status}): ${response.statusText} ${errorBody.message || ''}`);
  }
  return response.json();
};
