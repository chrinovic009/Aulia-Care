ALTER TABLE "NursingCareTask"
  ADD CONSTRAINT "NursingCareTask_assignedNurseId_fkey"
  FOREIGN KEY ("assignedNurseId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_prescriptionLineId_fkey"
  FOREIGN KEY ("prescriptionLineId") REFERENCES "PrescriptionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_administeredById_fkey"
  FOREIGN KEY ("administeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
