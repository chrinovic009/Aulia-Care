import { apiFetch } from "../config/api";

export type PayrollLine = { kind: "LATE" | "ABSENCE" | "UNPAID_LEAVE" | "ADVANCE" | "BONUS" | "OTHER"; label: string; amount: number };
export type Payroll = {
  id: string; employeeId: string; version: number; month: string;
  employee: { name: string; position: string | null; department: string | null };
  baseSalary: number | null; gross: number; currency: string;
  proposedLines: PayrollLine[]; proposedNet: number; appliedLines: PayrollLine[] | null; net: number;
  status: string; state: "PAID" | "LATE" | "TO_PAY"; dueDate: string | null; daysLate: number;
  paidAt: string | null; paymentMethod: string | null; paymentReference: string | null; notes: string | null;
  facts: { lateMinutes?: number; absentDays?: number; unpaidLeaveDays?: number; coveredDays?: number; daysInMonth?: number } | null;
};
export type PayrollMonth = { month: string; currency: string; payrolls: Payroll[]; missing: number; canManage: boolean; totals: { gross: number; paid: number; toPay: number; late: number; unpaid: number } };
export type PayrollOverview = { late: Payroll[]; toPay: Payroll[]; totals: { late: number; lateAmount: number; unpaid: number; unpaidAmount: number } };

export type Contract = { id: string; type: string; startDate: string; endDate: string | null; salary: number | null; currency: string; reason: string | null; active?: boolean; createdAt?: string };
export type HrEmployee = {
  id: string; name: string; position: string | null; status: string; role: string | null; department: string | null;
  hireDate: string | null; contract: Contract | null; contractEndsInDays: number | null;
  alert: "NO_CONTRACT" | "NO_SALARY" | "EXPIRED" | "ENDING_SOON" | null;
};

export type LeaveView = {
  id: string; type: string; typeLabel: string; startDate: string; endDate: string; days: number | null; reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; requestedAt: string; decidedAt: string | null; decisionNote: string | null; deductsBalance: boolean;
};
export type LeaveBalance = { year: number; months: number; acquired: number; seniorityYears: number; taken: number; pending: number; remaining: number };
export type AdminLeave = LeaveView & { employee: { id: string; name: string; position: string | null; department: string | null }; decidedBy: string | null; balance: LeaveBalance | null };
export type ReplacementView = { id: string; startAt: string; endAt: string; reason: string | null; status: string; colleagueNote: string | null; decisionNote: string | null; createdAt: string; leaveRequestId: string | null };

export type LateEntry = { attendanceId: string; date: string; plannedStartAt: string; clockInAt: string; minutes: number; duration: string; justified: boolean; note: string | null };
export type AbsenceEntry = { date: string; attendanceId: string | null; source: "DETECTED" | "RECORDED"; justified: boolean; note: string | null };
export type AttendanceRow = {
  employee: { id: string; name: string; position: string | null; department: string | null; status: string };
  plannedShifts: number; presentShifts: number; lateCount: number; lateMinutes: number; lateDuration: string; lateMinutesJustified: number;
  longestLate: LateEntry | null; absentDays: number; absences: AbsenceEntry[]; leaveDays: Record<string, number>; lateEntries: LateEntry[];
};
export type AttendanceReport = { month: string; rows: AttendanceRow[]; biggestLate: Array<LateEntry & { employee: string; employeeId: string }>; totals: { lateMinutes: number; lateDuration: string; lateCount: number; absentDays: number }; canEdit: boolean };

export type HrPolicy = { payDay: number; lateGraceMinutes: number; monthlyWorkingHours: number; workingDaysPerMonth: number; leaveDaysPerMonth: number; seniorityBonusYears: number; workWeekDays: number[]; attendanceDeductionsApproved: boolean; deductionsLegalBasis: string | null; deductionsApprovedAt: string | null; deductionsApprovedBy: string | null; canEdit: boolean };
export type HrPolicyInput = Omit<HrPolicy, "canEdit" | "attendanceDeductionsApproved" | "deductionsApprovedAt" | "deductionsApprovedBy"> & { approveAttendanceDeductions: boolean };

export type MySpace = {
  employee: { id: string; name: string; position: string | null; hireDate: string | null };
  leaveTypes: Array<{ code: string; label: string; deductsBalance: boolean }>;
  balance: LeaveBalance;
  leaves: LeaveView[];
  replacementsAsked: Array<ReplacementView & { colleague: string }>;
  replacementsAskedOfMe: Array<ReplacementView & { colleague: string }>;
  attendance: { month: string; plannedShifts: number; presentShifts: number; lateCount: number; lateDuration: string; lateEntries: LateEntry[]; absences: AbsenceEntry[] } | null;
  payslips: Payroll[];
};
export type Colleague = { id: string; name: string; position: string | null; department: string | null };

const post = <T,>(path: string, body: unknown = {}) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export const hrApi = {
  me: () => apiFetch<MySpace>("/hr/me"),
  colleagues: () => apiFetch<Colleague[]>("/hr/me/colleagues"),
  requestLeave: (body: { type: string; startDate: string; endDate: string; reason?: string; replacementEmployeeId?: string }) => post<LeaveView>("/hr/me/leaves", body),
  cancelLeave: (id: string) => post(`/hr/me/leaves/${id}/cancel`),
  requestReplacement: (body: { replacerId: string; startAt: string; endAt: string; reason: string }) => post<ReplacementView>("/hr/me/replacements", body),
  respondReplacement: (id: string, accept: boolean, note?: string) => post(`/hr/me/replacements/${id}/respond`, { accept, note }),
  cancelReplacement: (id: string) => post(`/hr/me/replacements/${id}/cancel`),

  policy: () => apiFetch<HrPolicy>("/hr/policy"),
  savePolicy: (body: HrPolicyInput) => apiFetch<HrPolicy>("/hr/policy", { method: "PUT", body: JSON.stringify(body) }),

  employees: () => apiFetch<{ canEdit: boolean; employees: HrEmployee[] }>("/hr/employees"),
  contracts: (employeeId: string) => apiFetch<Contract[]>(`/hr/employees/${employeeId}/contracts`),
  createContract: (employeeId: string, body: { type: string; startDate: string; endDate?: string | null; salary: number; currency?: string; reason?: string }) => post(`/hr/employees/${employeeId}/contracts`, body),
  changeSalary: (employeeId: string, body: { salary: number; effectiveDate: string; reason: string }) => post(`/hr/employees/${employeeId}/salary`, body),
  updateContract: (contractId: string, body: { endDate?: string | null; type?: string }) => apiFetch(`/hr/contracts/${contractId}`, { method: "PATCH", body: JSON.stringify(body) }),

  payroll: (month: string) => apiFetch<PayrollMonth>(`/hr/payroll?month=${month}`),
  payrollOverview: () => apiFetch<PayrollOverview>("/hr/payroll/overview"),
  generatePayroll: (month: string) => post<{ created: number; refreshed: number; skipped: number }>("/hr/payroll/generate", { month }),
  recomputePayroll: (id: string) => post<Payroll>(`/hr/payroll/${id}/recompute`),
  payPayroll: (id: string, body: { version: number; lines: PayrollLine[]; paymentMethod?: string; paymentReference?: string; notes?: string }) => post<Payroll>(`/hr/payroll/${id}/pay`, body),

  leaves: (status?: string) => apiFetch<{ canDecide: boolean; leaves: AdminLeave[] }>(`/hr/leaves${status ? `?status=${status}` : ""}`),
  decideLeave: (id: string, body: { decision: "APPROVE" | "REJECT"; note?: string; force?: boolean }) => post(`/hr/leaves/${id}/decide`, body),
  replacements: (status?: string) => apiFetch<{ canDecide: boolean; replacements: Array<ReplacementView & { requester: string; requesterPosition: string | null; replacer: string; replacerPosition: string | null }> }>(`/hr/replacements${status ? `?status=${status}` : ""}`),
  decideReplacement: (id: string, body: { decision: "APPROVE" | "REJECT"; note?: string }) => post(`/hr/replacements/${id}/decide`, body),

  attendance: (month: string) => apiFetch<AttendanceReport>(`/hr/attendance?month=${month}`),
  recordAbsence: (body: { employeeId: string; date: string; justified?: boolean; note?: string }) => post("/hr/attendance/absences", body),
  justify: (attendanceId: string, justified: boolean, note?: string) => post(`/hr/attendance/${attendanceId}/justify`, { justified, note }),
};

/** "45 min" below an hour, "3 h 46 min" beyond (same rule as the server). */
export const formatDuration = (totalMinutes: number) => {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
};
export const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
