CREATE TABLE "ClinicPacsConfiguration" (
  "clinicId" TEXT NOT NULL PRIMARY KEY REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "previewUrlTemplate" TEXT,
  "tokenCiphertext" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);