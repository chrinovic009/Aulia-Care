import { apiFetch } from "../config/api";

export type FinanceDashboard = {
  kpis: { operationalCashEstimate: number; monthlyRevenue: number; previousMonthRevenue: number; previousYearRevenue: number; revenueObjective: number | null; receivables: number; urgentReceivables: number; netMarginPercent: number };
  cashFlow: Array<{ month: string; inflows: number; outflows: number; net: number }>;
  revenueByPole: Array<{ name: string; value: number }>;
  alerts: { supplierInvoices: Array<{ id: string; label: string; dueDate?: string | null; amount: number }>; budgetOverruns: Array<{ id: string; label: string; allocatedAmount: number; consumedAmount: number }>; insuranceRejections: Array<{ id: string; patient: string; amount: number; reason: string }> };
  dataQuality: { unscopedLegacyExpensesIncluded: boolean; note: string };
};

export type FinanceTreasury = {
  receivables: Array<{ id: string; debtor: string; invoiceType: string; issuedAt: string; dueDate?: string | null; amount: number; ageDays: number; bucket: string }>;
  agedReceivables: Array<{ bucket: string; amount: number; count: number }>;
  supplierInvoices: Array<{ id: string; supplier: string; invoiceNumber: string; dueDate?: string | null; status: string; amount: number; paidAmount: number; balanceDue: number }>;
  payroll: Array<{ id: string; employee: string; department: string; periodEnd: string; grossAmount: number; netAmount: number; status: string }>;
  canSendReminder: boolean;
  reminderNotice: string;
};

export type FinancePole = "ADMISSION_FEE" | "SERVICE" | "PHARMACY" | "LABORATORY" | "RADIOLOGY" | "SURGERY" | "SUBSCRIPTION_MONTHLY" | "OTHER";
export type FinanceBudget = { id: string; departmentId?: string | null; name: string; fiscalYear: number; type: "OPERATING" | "REVENUE_TARGET"; allocatedAmount: number; consumedAmount: number; availableAmount: number; consumptionRate: number; status: "DRAFT" | "APPROVED" | "CLOSED" | "ARCHIVED"; notes?: string | null; allocations: Array<{ id: string; amount: number; label: string; sourceKind: string; sourceReference: string; supportingDocumentUrl?: string | null; revenuePole?: FinancePole | null; occurredAt: string; note?: string | null }> };
export type CapitalInvestment = { id: string; label: string; category: string; revenuePole?: FinancePole | null; plannedAmount: number; acquiredAmount?: number | null; plannedAt?: string | null; acquiredAt?: string | null; usefulLifeMonths?: number | null; expectedAnnualReturn?: number | null; monthlyDepreciation?: number | null; status: string; notes?: string | null };
export type FinanceBudgets = { departments: Array<{ id: string; name: string; type: string }>; budgets: FinanceBudget[]; investments: CapitalInvestment[]; supplierSources: Array<{ id: string; label: string; reference: string }>; expenseSources: Array<{ id: string; label: string; reference: string }>; profitability: Array<{ pole: string; revenue: number; cost: number | null; margin: number | null }>; dataNotice: string };
export type FinanceBanking = { accounts: Array<{ id: string; bankName: string; accountName: string; maskedAccountNumber: string; currency: string; status: "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "CLOSED"; openingBalance: number; openingBalanceAt: string; pendingStatementCount: number; recentEntries: Array<{ id: string; externalReference: string; transactionAt: string; amount: number; description: string; status: string }> }>; reconciliations: Array<{ id: string; status: string; bankName: string; accountName: string; statementReference: string; amount: number; transactionAt: string; note?: string | null; createdAt: string }>; paymentCandidates: Array<{ id: string; amount: number; paidAt: string; reference: string }> };

export const fetchFinanceDashboard = () => apiFetch<FinanceDashboard>("/billing/finance/dashboard");
export const fetchFinanceTreasury = () => apiFetch<FinanceTreasury>("/billing/finance/treasury");
export const fetchFinanceBudgets = () => apiFetch<FinanceBudgets>("/billing/finance/budgets");
export const fetchFinanceBanking = () => apiFetch<FinanceBanking>("/billing/finance/banking");
export const createBankAccount = (body: { bankName: string; accountName: string; accountNumber: string; currency?: string; openingBalance?: number; openingBalanceAt?: string }) => apiFetch<{ id: string; status: string; maskedAccountNumber: string }>("/billing/finance/bank-accounts", { method: "POST", body: JSON.stringify(body) });
export const updateBankAccountStatus = (bankAccountId: string, status: "ACTIVE" | "SUSPENDED" | "CLOSED") => apiFetch<{ id: string; status: string }>(`/billing/finance/bank-accounts/${encodeURIComponent(bankAccountId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const importBankStatementEntry = (bankAccountId: string, body: { externalReference: string; transactionAt: string; amount: number; description: string }) => apiFetch(`/billing/finance/bank-accounts/${encodeURIComponent(bankAccountId)}/statement-entries`, { method: "POST", body: JSON.stringify(body) });
export const proposeBankReconciliation = (bankAccountId: string, body: { bankStatementEntryId: string; paymentId: string; note?: string }) => apiFetch(`/billing/finance/bank-accounts/${encodeURIComponent(bankAccountId)}/reconciliations`, { method: "POST", body: JSON.stringify(body) });
export const reviewBankReconciliation = (reconciliationId: string, status: "APPROVED" | "REJECTED", note?: string) => apiFetch(`/billing/finance/reconciliations/${encodeURIComponent(reconciliationId)}`, { method: "PATCH", body: JSON.stringify({ status, note }) });
export const createFinanceBudget = (body: { name: string; departmentId?: string; fiscalYear: number; type?: "OPERATING" | "REVENUE_TARGET"; allocatedAmount: number; notes?: string }) => apiFetch<FinanceBudget>("/billing/finance/budgets", { method: "POST", body: JSON.stringify(body) });
export const updateFinanceBudgetStatus = (budgetId: string, status: FinanceBudget["status"]) => apiFetch<FinanceBudget>(`/billing/finance/budgets/${encodeURIComponent(budgetId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
export const createBudgetAllocation = (budgetId: string, body: { amount: number; label: string; sourceKind: "SUPPLIER_INVOICE" | "EXPENSE" | "SUPPORTING_DOCUMENT"; sourceReference: string; supplierInvoiceId?: string; expenseId?: string; supportingDocumentUrl?: string; revenuePole?: FinancePole; occurredAt?: string; note?: string }) => apiFetch(`/billing/finance/budgets/${encodeURIComponent(budgetId)}/allocations`, { method: "POST", body: JSON.stringify(body) });
export const createCapitalInvestment = (body: { label: string; category: string; revenuePole?: FinancePole; plannedAmount: number; plannedAt?: string; usefulLifeMonths?: number; expectedAnnualReturn?: number; notes?: string }) => apiFetch<CapitalInvestment>("/billing/finance/investments", { method: "POST", body: JSON.stringify(body) });
export const updateCapitalInvestmentStatus = (investmentId: string, status: string) => apiFetch<CapitalInvestment>(`/billing/finance/investments/${encodeURIComponent(investmentId)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
