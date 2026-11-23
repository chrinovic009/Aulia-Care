-- ===========================================================================
-- Human resources: contracts with salary history, payroll with proposed and
-- applied adjustments, leave balance, colleague replacements, justified
-- lateness/absences and the establishment's HR rules.
-- ===========================================================================

-- AlterTable
ALTER TABLE "EmployeeContract" ADD COLUMN "reason" TEXT,
ADD COLUMN "createdById" TEXT;

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN "justified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "note" TEXT,
ADD COLUMN "recordedById" TEXT;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN "days" DECIMAL(6,1),
ADD COLUMN "deductsBalance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "decisionNote" TEXT,
ADD COLUMN "replacementEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN "baseSalary" DECIMAL(12,2),
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CDF',
ADD COLUMN "dueDate" TIMESTAMP(3),
ADD COLUMN "proposedDeductions" JSONB,
ADD COLUMN "adjustments" JSONB,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paidById" TEXT,
ADD COLUMN "paymentMethod" TEXT,
ADD COLUMN "paymentReference" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ReplacementRequest" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "replacerId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_COLLEAGUE',
    "colleagueNote" TEXT,
    "colleagueRespondedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "shiftId" TEXT,
    "leaveRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplacementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPolicy" (
    "clinicId" TEXT NOT NULL,
    "payDay" INTEGER NOT NULL DEFAULT 5,
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 5,
    "monthlyWorkingHours" DECIMAL(6,2) NOT NULL DEFAULT 195,
    "workingDaysPerMonth" INTEGER NOT NULL DEFAULT 26,
    "leaveDaysPerMonth" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "seniorityBonusYears" INTEGER NOT NULL DEFAULT 5,
    "workWeekDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPolicy_pkey" PRIMARY KEY ("clinicId")
);

-- CreateIndex
CREATE INDEX "ReplacementRequest_clinicId_status_idx" ON "ReplacementRequest"("clinicId", "status");

-- CreateIndex
CREATE INDEX "ReplacementRequest_replacerId_status_idx" ON "ReplacementRequest"("replacerId", "status");

-- A month can only be paid once per employee. Older duplicate drafts (never
-- produced by the application) would make this index fail: keep the latest.
DELETE FROM "Payroll" p USING "Payroll" q
WHERE p."employeeId" = q."employeeId" AND p."periodStart" = q."periodStart"
  AND p."status" <> 'PAID' AND (p."createdAt", p."id") < (q."createdAt", q."id");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_employeeId_periodStart_key" ON "Payroll"("employeeId", "periodStart");

-- AddForeignKey
ALTER TABLE "ReplacementRequest" ADD CONSTRAINT "ReplacementRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementRequest" ADD CONSTRAINT "ReplacementRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementRequest" ADD CONSTRAINT "ReplacementRequest_replacerId_fkey" FOREIGN KEY ("replacerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPolicy" ADD CONSTRAINT "HrPolicy_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Establishment isolation. HR records follow their employee and are never
-- visible to a patient-portal session (salaries, absences, leave reasons).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  link TEXT[];
  links TEXT[][] := ARRAY[
    ARRAY['EmployeeContract', 'employeeId'], ARRAY['Attendance', 'employeeId'],
    ARRAY['Shift', 'employeeId'], ARRAY['LeaveRequest', 'employeeId'], ARRAY['Payroll', 'employeeId']
  ];
  predicate TEXT;
BEGIN
  FOREACH link SLICE 1 IN ARRAY links LOOP
    predicate := format(
      'coalesce(current_setting(''app.user_role'', true), '''') <> ''PATIENT'' AND EXISTS (SELECT 1 FROM "Employee" AS parent WHERE parent."id" = %I.%I)',
      link[1], link[2]);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', link[1]);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', link[1]);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', link[1] || '_tenant_isolation', link[1]);
    EXECUTE format('CREATE POLICY %I ON %I USING (%s) WITH CHECK (%s)', link[1] || '_tenant_isolation', link[1], predicate, predicate);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO aulia_app', link[1]);
  END LOOP;

  FOREACH predicate IN ARRAY ARRAY['ReplacementRequest', 'HrPolicy'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', predicate);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', predicate);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', predicate || '_tenant_isolation', predicate);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (coalesce(current_setting(''app.user_role'', true), '''') <> ''PATIENT'' AND "aulia_clinic_reference_visible"("clinicId")) WITH CHECK (coalesce(current_setting(''app.user_role'', true), '''') <> ''PATIENT'' AND "aulia_clinic_reference_visible"("clinicId"))',
      predicate || '_tenant_isolation', predicate);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO aulia_app', predicate);
  END LOOP;
END $$;
