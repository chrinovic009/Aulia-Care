import { apiFetch } from "../config/api";

export type SubscriptionCompany = {
  id: string;
  name: string;
  legalName?: string | null;
  contractNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  contactName?: string | null;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  billingDay?: number;
  employees?: SubscriptionEmployee[];
  charges?: SubscriptionCharge[];
  monthlyInvoices?: MonthlySubscriptionInvoice[];
};

export type SubscriptionEmployee = {
  id: string;
  companyId: string;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender?: string | null;
  profession?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  nationality?: string | null;
  policyNumber: string;
  employeeNumber?: string | null;
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE";
  company?: SubscriptionCompany;
};

export type SubscriptionCharge = {
  id: string;
  label: string;
  amount: string | number;
  currency?: string;
  serviceDate: string;
  month: number;
  year: number;
  status: string;
  employee?: SubscriptionEmployee | null;
  patient?: { firstName?: string; lastName?: string } | null;
  service?: { name?: string } | null;
};

export type MonthlySubscriptionInvoice = {
  id: string;
  month: number;
  year: number;
  totalAmount: string | number;
  status: string;
  generatedAt: string;
  dueDate?: string | null;
  invoiceId?: string | null;
};

export const fetchSubscriptionCompanies = () =>
  apiFetch<SubscriptionCompany[]>("/subscriptions/companies");

export const fetchSubscriptionCompany = (id: string) =>
  apiFetch<SubscriptionCompany>(`/subscriptions/companies/${id}`);

export const createSubscriptionCompany = (payload: Partial<SubscriptionCompany>) =>
  apiFetch<SubscriptionCompany>("/subscriptions/companies", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateSubscriptionCompany = (id: string, payload: Partial<SubscriptionCompany>) =>
  apiFetch<SubscriptionCompany>(`/subscriptions/companies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const createSubscriptionEmployee = (companyId: string, payload: Partial<SubscriptionEmployee>) =>
  apiFetch<SubscriptionEmployee>(`/subscriptions/companies/${companyId}/employees`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchAdmissibleSubscriptionEmployees = (companyId?: string) =>
  apiFetch<SubscriptionEmployee[]>(`/subscriptions/employees/admissible${companyId ? `?companyId=${companyId}` : ""}`);

export const admitSubscriptionEmployee = (employeeId: string, payload: any) =>
  apiFetch(`/subscriptions/employees/${employeeId}/admit`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const generateMonthlySubscriptionInvoice = (companyId: string, payload: { month: number; year: number }) =>
  apiFetch(`/subscriptions/companies/${companyId}/monthly-invoices`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
