// Minimal mock finance API for cashier pages — localStorage-backed
export type PaymentRequest = {
  id: string;
  patientId?: string;
  patientName: string;
  dossierNumber?: string;
  service: string;
  requestedBy?: string;
  act: string;
  amount: number;
  priority?: "low" | "normal" | "urgent";
  createdAt: string;
  status: "pending" | "deferred" | "paid" | "failed";
};

export type Payment = {
  id: string;
  requestId?: string;
  patientId?: string;
  patientName: string;
  amount: number;
  method: "cash" | "airtel" | "other";
  reference?: string;
  cashier?: string;
  status: "completed" | "failed" | "refunded";
  createdAt: string;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  patientId?: string;
  patientName: string;
  requestId?: string;
  amount: number;
  paymentId?: string;
  status: "paid" | "pending" | "cancelled";
  createdAt: string;
};

const REQ_KEY = "d7-payment-requests";
const PAY_KEY = "d7-payments";
const INV_KEY = "d7-invoices";

const read = (k: string) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const dispatchPaymentRequestsUpdated = () => {
  try {
    window.dispatchEvent(new CustomEvent("d7:paymentRequestsUpdated"));
  } catch {
    // ignore browser dispatch errors
  }
};

const write = (k: string, v: any) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    if (k === REQ_KEY) {
      dispatchPaymentRequestsUpdated();
    }
  } catch {}
};

export const getPaymentRequests = (): PaymentRequest[] => read(REQ_KEY);

export const createPaymentRequest = (payload: Partial<PaymentRequest>) => {
  const id = `req-${Date.now()}`;
  const rec: PaymentRequest = {
    id,
    patientId: payload.patientId,
    patientName: payload.patientName || "Inconnu",
    dossierNumber: payload.dossierNumber,
    service: payload.service || "Général",
    requestedBy: payload.requestedBy,
    act: payload.act || "Acte",
    amount: payload.amount || 0,
    priority: payload.priority || "normal",
    createdAt: new Date().toISOString(),
    status: payload.status || "pending",
  };
  const arr = read(REQ_KEY);
  arr.unshift(rec);
  write(REQ_KEY, arr);
  try {
    window.dispatchEvent(new CustomEvent("d7:paymentRequest", { detail: rec }));
  } catch {
    // ignore browser dispatch errors
  }
  return rec;
};

export const deferPaymentRequest = (id: string) => {
  const arr: PaymentRequest[] = read(REQ_KEY);
  const idx = arr.findIndex((r) => r.id === id);
  if (idx >= 0) {
    arr[idx].status = "deferred" as any;
    write(REQ_KEY, arr);
  }
};

export const removePaymentRequest = (id: string) => {
  const arr: PaymentRequest[] = read(REQ_KEY).filter((r: any) => r.id !== id);
  write(REQ_KEY, arr);
};

export const getPayments = (): Payment[] => read(PAY_KEY);

export const createPayment = (payload: Partial<Payment>) => {
  const id = `pay-${Date.now()}`;
  const rec: Payment = {
    id,
    requestId: payload.requestId,
    patientId: payload.patientId,
    patientName: payload.patientName || "Inconnu",
    amount: payload.amount || 0,
    method: payload.method || "cash",
    reference: payload.reference,
    cashier: payload.cashier || "Caissière",
    status: payload.status || "completed",
    createdAt: new Date().toISOString(),
  };
  const arr = read(PAY_KEY);
  arr.unshift(rec);
  write(PAY_KEY, arr);
  return rec;
};

export const getInvoices = (): Invoice[] => read(INV_KEY);

export const createInvoice = (payload: Partial<Invoice>) => {
  const id = `inv-${Date.now()}`;
  const invNumber = `FAC-${Date.now().toString().slice(-8)}`;
  const rec: Invoice = {
    id,
    invoiceNumber: invNumber,
    patientId: payload.patientId,
    patientName: payload.patientName || "Inconnu",
    requestId: payload.requestId,
    amount: payload.amount || 0,
    paymentId: payload.paymentId,
    status: payload.status || (payload.paymentId ? "paid" : "pending"),
    createdAt: new Date().toISOString(),
  };
  const arr = read(INV_KEY);
  arr.unshift(rec);
  write(INV_KEY, arr);
  return rec;
};

export const clearFinance = () => {
  write(REQ_KEY, []);
  write(PAY_KEY, []);
  write(INV_KEY, []);
};
