CREATE TABLE "ImagingReportAmendment" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "impression" TEXT NOT NULL,
    "recommendations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagingReportAmendment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImagingReportAmendment_reportId_version_key" ON "ImagingReportAmendment"("reportId", "version");
CREATE INDEX "ImagingReportAmendment_clinicId_createdAt_idx" ON "ImagingReportAmendment"("clinicId", "createdAt");

ALTER TABLE "ImagingReportAmendment" ADD CONSTRAINT "ImagingReportAmendment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ImagingReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingReportAmendment" ADD CONSTRAINT "ImagingReportAmendment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImagingReportAmendment" ADD CONSTRAINT "ImagingReportAmendment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
