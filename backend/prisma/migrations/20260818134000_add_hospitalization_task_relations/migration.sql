ALTER TABLE "NursingCareTask"
  ADD CONSTRAINT "NursingCareTask_hospitalizationId_fkey"
  FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicationAdministration"
  ADD CONSTRAINT "MedicationAdministration_hospitalizationId_fkey"
  FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
