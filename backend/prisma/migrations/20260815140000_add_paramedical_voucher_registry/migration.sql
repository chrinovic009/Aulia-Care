CREATE TABLE "ParamedicalVoucher" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scanUrl" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParamedicalVoucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ParamedicalVoucher_number_key" ON "ParamedicalVoucher"("number");
CREATE UNIQUE INDEX "ParamedicalVoucher_patientId_key" ON "ParamedicalVoucher"("patientId");
CREATE INDEX "ParamedicalVoucher_issuer_receivedAt_idx" ON "ParamedicalVoucher"("issuer", "receivedAt");
CREATE INDEX "ParamedicalVoucher_serviceId_idx" ON "ParamedicalVoucher"("serviceId");

ALTER TABLE "ParamedicalVoucher" ADD CONSTRAINT "ParamedicalVoucher_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
