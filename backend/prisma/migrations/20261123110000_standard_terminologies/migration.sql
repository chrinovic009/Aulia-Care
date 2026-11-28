-- Standard terminologies: ICD-10 (CIM-10) for diagnoses, LOINC for laboratory
-- and imaging exams. Terminologies are universal reference data (not owned by
-- an establishment): the platform loads the official files; the starter set
-- below only covers the ICD-10 chapters and a few frequent conditions.
CREATE TABLE "ClinicalCode" (
  "id" TEXT NOT NULL,
  "system" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "display" TEXT NOT NULL,
  "parentCode" TEXT,
  "chapter" TEXT,
  "isChapter" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicalCode_system_code_key" ON "ClinicalCode"("system", "code");
CREATE INDEX "ClinicalCode_system_display_idx" ON "ClinicalCode"("system", "display");
CREATE TRIGGER "ClinicalCode_audit_ledger" AFTER INSERT OR UPDATE OR DELETE ON "ClinicalCode" FOR EACH ROW EXECUTE FUNCTION "audit_capture"();

ALTER TABLE "Diagnosis" ADD COLUMN "codeSystem" TEXT;
ALTER TABLE "LabTest" ADD COLUMN "loincCode" TEXT;
ALTER TABLE "LabTestParameter" ADD COLUMN "loincCode" TEXT;
ALTER TABLE "ImagingCatalogue" ADD COLUMN "loincCode" TEXT;

INSERT INTO "ClinicalCode" ("id", "system", "code", "display", "chapter", "isChapter", "version") VALUES
  (gen_random_uuid()::text, 'ICD10', 'I', 'Certaines maladies infectieuses et parasitaires (A00-B99)', 'I', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'II', 'Tumeurs (C00-D48)', 'II', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'III', 'Maladies du sang et des organes hématopoïétiques et certains troubles du système immunitaire (D50-D89)', 'III', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'IV', 'Maladies endocriniennes, nutritionnelles et métaboliques (E00-E90)', 'IV', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'V', 'Troubles mentaux et du comportement (F00-F99)', 'V', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'VI', 'Maladies du système nerveux (G00-G99)', 'VI', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'VII', 'Maladies de l''œil et de ses annexes (H00-H59)', 'VII', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'VIII', 'Maladies de l''oreille et de l''apophyse mastoïde (H60-H95)', 'VIII', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'IX', 'Maladies de l''appareil circulatoire (I00-I99)', 'IX', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'X', 'Maladies de l''appareil respiratoire (J00-J99)', 'X', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XI', 'Maladies de l''appareil digestif (K00-K93)', 'XI', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XII', 'Maladies de la peau et du tissu cellulaire sous-cutané (L00-L99)', 'XII', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XIII', 'Maladies du système ostéo-articulaire, des muscles et du tissu conjonctif (M00-M99)', 'XIII', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XIV', 'Maladies de l''appareil génito-urinaire (N00-N99)', 'XIV', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XV', 'Grossesse, accouchement et puerpéralité (O00-O99)', 'XV', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XVI', 'Certaines affections dont l''origine se situe dans la période périnatale (P00-P96)', 'XVI', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XVII', 'Malformations congénitales et anomalies chromosomiques (Q00-Q99)', 'XVII', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XVIII', 'Symptômes, signes et résultats anormaux d''examens cliniques et de laboratoire, non classés ailleurs (R00-R99)', 'XVIII', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XIX', 'Lésions traumatiques, empoisonnements et certaines autres conséquences de causes externes (S00-T98)', 'XIX', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XX', 'Causes externes de morbidité et de mortalité (V01-Y98)', 'XX', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XXI', 'Facteurs influant sur l''état de santé et motifs de recours aux services de santé (Z00-Z99)', 'XXI', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'XXII', 'Codes d''utilisation particulière (U00-U85)', 'XXII', true, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'A09', 'Diarrhée et gastro-entérite d''origine présumée infectieuse', 'I', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'A01.0', 'Fièvre typhoïde', 'I', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'A15', 'Tuberculose respiratoire, avec confirmation bactériologique et histologique', 'I', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'B20', 'Maladie due au virus de l''immunodéficience humaine [VIH], à l''origine de maladies infectieuses et parasitaires', 'I', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'B50', 'Paludisme à Plasmodium falciparum', 'I', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'B54', 'Paludisme, sans précision', 'I', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'D50', 'Anémie par carence en fer', 'III', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'E11', 'Diabète sucré non insulino-dépendant', 'IV', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'E46', 'Malnutrition protéino-énergétique, sans précision', 'IV', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'I10', 'Hypertension essentielle (primitive)', 'IX', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'J06.9', 'Infection aiguë des voies respiratoires supérieures, sans précision', 'X', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'J18.9', 'Pneumopathie, sans précision', 'X', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'K35', 'Appendicite aiguë', 'XI', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'N18', 'Maladie rénale chronique', 'XIV', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'N39.0', 'Infection des voies urinaires, siège non précisé', 'XIV', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'O80', 'Accouchement unique et spontané', 'XV', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'R50.9', 'Fièvre, sans précision', 'XVIII', false, 'OMS 2019'),
  (gen_random_uuid()::text, 'ICD10', 'S82', 'Fracture de la jambe, y compris la cheville', 'XIX', false, 'OMS 2019');
