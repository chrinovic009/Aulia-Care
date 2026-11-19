INSERT INTO "Role" ("id","slug","name","createdAt","updatedAt") VALUES ('aulia-medical-director','MEDICAL_DIRECTOR','Médecin directeur',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("slug") DO NOTHING;
CREATE TABLE "ConsultationReferral" (
 "id" TEXT PRIMARY KEY,"clinicId" TEXT NOT NULL REFERENCES "Clinic"("id"),"patientId" TEXT NOT NULL REFERENCES "Patient"("id"),
 "sourceConsultationId" TEXT NOT NULL REFERENCES "Consultation"("id"),"recipientConsultationId" TEXT REFERENCES "Consultation"("id"),
 "senderId" TEXT NOT NULL REFERENCES "User"("id"),"recipientId" TEXT NOT NULL REFERENCES "User"("id"),"operationId" TEXT NOT NULL,
 "question" TEXT NOT NULL,"urgency" TEXT NOT NULL CHECK ("urgency" IN ('ROUTINE','URGENT')),
 "status" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','ACCEPTED','REJECTED','CANCELLED','COMPLETED')),
 "response" TEXT,"version" INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ("senderId" <> "recipientId"), UNIQUE ("senderId","operationId")
);
CREATE INDEX "ConsultationReferral_clinicId_recipientId_status_idx" ON "ConsultationReferral"("clinicId","recipientId","status");
CREATE TABLE "ConsultationPolicy" (
 "id" TEXT PRIMARY KEY,"clinicId" TEXT NOT NULL REFERENCES "Clinic"("id"),"specialty" TEXT NOT NULL,"required" TEXT[] NOT NULL,
 "rationale" TEXT NOT NULL,"approvedById" TEXT NOT NULL REFERENCES "User"("id"),"approvedAt" TIMESTAMP(3) NOT NULL,"version" INTEGER NOT NULL DEFAULT 1, UNIQUE ("clinicId","specialty")
);
ALTER TABLE "ConsultationReferral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsultationReferral" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ConsultationReferral_tenant" ON "ConsultationReferral" USING ("aulia_tenant_visible"("clinicId")) WITH CHECK ("aulia_tenant_visible"("clinicId"));
ALTER TABLE "ConsultationPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsultationPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ConsultationPolicy_tenant" ON "ConsultationPolicy" USING ("aulia_tenant_visible"("clinicId")) WITH CHECK ("aulia_tenant_visible"("clinicId"));
CREATE TRIGGER "ConsultationReferral_audit" AFTER INSERT OR UPDATE OR DELETE ON "ConsultationReferral" FOR EACH ROW EXECUTE FUNCTION "audit_capture"();
CREATE TRIGGER "ConsultationPolicy_audit" AFTER INSERT OR UPDATE OR DELETE ON "ConsultationPolicy" FOR EACH ROW EXECUTE FUNCTION "audit_capture"();
GRANT SELECT,INSERT,UPDATE,DELETE ON "ConsultationReferral","ConsultationPolicy" TO aulia_app;
