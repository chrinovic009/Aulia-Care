-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoleSlug" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'SURGEON', 'ANESTHESIOLOGIST', 'PHARMACIST', 'CASHIER');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REVIEW');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalizationStatus" AS ENUM ('ADMITTED', 'TRANSFERRED', 'DISCHARGED', 'CANCELLATION_REQUESTED');

-- CreateEnum
CREATE TYPE "VitalType" AS ENUM ('TEMPERATURE', 'BLOOD_PRESSURE', 'HEART_RATE', 'RESPIRATORY_RATE', 'OXYGEN_SATURATION', 'WEIGHT', 'HEIGHT', 'BLOOD_GLUCOSE');

-- CreateEnum
CREATE TYPE "LabRequestStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImagingRequestStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('PRESCRIBED', 'DISPENSED', 'PARTIALLY_DISPENSED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MedicationRoute" AS ENUM ('ORAL', 'INTRAVENOUS', 'INTRAMUSCULAR', 'SUBCUTANEOUS', 'TOPICAL', 'INHALATION', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicationFrequency" AS ENUM ('ONCE', 'DAILY', 'BID', 'TID', 'QID', 'PRN', 'CONTINUOUS');

-- CreateEnum
CREATE TYPE "SurgeryStatus" AS ENUM ('PLANNED', 'PREOP', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTOP');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('ADMISSION_FEE', 'SERVICE', 'PHARMACY', 'LABORATORY', 'RADIOLOGY', 'SURGERY', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'AIRTEL_MONEY', 'M_PESA', 'BANK_TRANSFER', 'INSURANCE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ALERT', 'REMINDER', 'TASK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PatientWorkflowStatus" AS ENUM ('EN_ATTENTE_DE_PAIEMENT', 'EN_ATTENTE_VALIDATION_CAISSE', 'EN_ATTENTE_INFIRMERIE', 'EN_ATTENTE_MEDECIN', 'EN_CONSULTATION', 'EN_LABORATOIRE', 'EN_RADIOLOGIE', 'EN_PHARMACIE', 'HOSPITALISE', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('FREE', 'OCCUPIED', 'CLEANING', 'RESERVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ACCESS', 'SIGN_IN', 'SIGN_OUT', 'APPROVE', 'REJECT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "EncounterType" AS ENUM ('OUTPATIENT', 'INPATIENT', 'EMERGENCY', 'TELEHEALTH');

-- CreateEnum
CREATE TYPE "DepartmentType" AS ENUM ('RECEPTION', 'NURSING', 'MEDICAL', 'LABORATORY', 'RADIOLOGY', 'SURGERY', 'PHARMACY', 'BILLING', 'ADMINISTRATION');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "slug" "RoleSlug" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "primaryRole" "RoleSlug",
    "specialty" TEXT,
    "bio" TEXT,
    "profilePhotoUrl" TEXT,
    "phone" TEXT,
    "whatsappUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "linkedinUrl" TEXT,
    "nationality" TEXT,
    "addressCountry" TEXT,
    "addressProvince" TEXT,
    "addressCity" TEXT,
    "addressNeighborhood" TEXT,
    "addressStreet" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "preferredLanguage" TEXT DEFAULT 'fr',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DepartmentType" NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "location" TEXT,
    "contactNumber" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTarif" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "prix" DECIMAL(12,2) NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceTarif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionFee" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Frais de fiche d''admission',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AdmissionFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceStaff" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInService" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceResponsable" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ServiceResponsable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT,
    "gender" TEXT NOT NULL,
    "profession" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "nationality" TEXT,
    "bloodType" TEXT,
    "emergencyContact" TEXT,
    "emergencyPhone" TEXT,
    "insuranceProvider" TEXT,
    "insuranceNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "PatientWorkflowStatus" NOT NULL DEFAULT 'EN_ATTENTE_DE_PAIEMENT',
    "admissionType" TEXT,
    "priority" TEXT,
    "arrivalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "receptionistId" TEXT,
    "serviceId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientContact" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PatientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "serviceUnitId" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'FREE',
    "hospitalizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MedicalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requestedById" TEXT,
    "serviceUnitId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "reason" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospitalization" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "serviceUnitId" TEXT,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "status" "HospitalizationStatus" NOT NULL DEFAULT 'ADMITTED',
    "admissionReason" TEXT NOT NULL,
    "dischargeReason" TEXT,
    "bedNumber" TEXT,
    "physicianId" TEXT,
    "nurseInChargeId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Hospitalization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalSign" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "recordedById" TEXT,
    "type" "VitalType" NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "consultationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VitalSign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "hospitalizationId" TEXT,
    "providerId" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'DRAFT',
    "encounterType" "EncounterType" NOT NULL DEFAULT 'OUTPATIENT',
    "chiefComplaint" TEXT,
    "clinicalSummary" TEXT,
    "diagnosis" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationNote" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "authorId" TEXT,
    "noteType" TEXT NOT NULL DEFAULT 'GENERAL',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ConsultationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescriberId" TEXT,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'PRESCRIBED',
    "prescribingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instruction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionLine" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "route" "MedicationRoute" NOT NULL,
    "frequency" "MedicationFrequency" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "durationDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PrescriptionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "strength" TEXT,
    "manufacturer" TEXT,
    "isControlled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDispense" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "dispensedById" TEXT,
    "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'DISPENSED',
    "notes" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PharmacyDispense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDispenseLine" (
    "id" TEXT NOT NULL,
    "pharmacyDispenseId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PharmacyDispenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabRequest" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "LabRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "specimenType" TEXT,
    "priority" TEXT DEFAULT 'NORMAL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LabRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabResult" (
    "id" TEXT NOT NULL,
    "labRequestId" TEXT NOT NULL,
    "resultCode" TEXT NOT NULL,
    "resultName" TEXT NOT NULL,
    "resultValue" TEXT NOT NULL,
    "units" TEXT,
    "referenceRange" TEXT,
    "interpretation" TEXT,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagingRequest" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requestedById" TEXT,
    "status" "ImagingRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "modality" TEXT NOT NULL,
    "bodyPart" TEXT NOT NULL,
    "urgency" TEXT DEFAULT 'ROUTINE',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ImagingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagingReport" (
    "id" TEXT NOT NULL,
    "imagingRequestId" TEXT NOT NULL,
    "interpretedById" TEXT,
    "findings" TEXT NOT NULL,
    "impression" TEXT NOT NULL,
    "recommendations" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ImagingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OperatingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Surgery" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT,
    "operatingRoomId" TEXT,
    "surgeonId" TEXT,
    "anesthesiologistId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "SurgeryStatus" NOT NULL DEFAULT 'PLANNED',
    "procedureName" TEXT NOT NULL,
    "indication" TEXT NOT NULL,
    "findings" TEXT,
    "postoperativePlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Surgery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "issuedById" TEXT,
    "type" "InvoiceType" NOT NULL DEFAULT 'ADMISSION_FEE',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "balanceDue" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paidById" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "patientId" TEXT,
    "recipientId" TEXT,
    "authorId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'ALERT',
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedEntity" TEXT,
    "relatedId" TEXT,
    "sendAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "patientId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "sourceNode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_slug_key" ON "Role"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_action_resource_key" ON "Permission"("action", "resource");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_primaryRole_idx" ON "User"("primaryRole");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceUnit_departmentId_name_key" ON "ServiceUnit"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceStaff_serviceId_userId_key" ON "ServiceStaff"("serviceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_externalId_key" ON "Patient"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_email_key" ON "Patient"("email");

-- CreateIndex
CREATE INDEX "Patient_lastName_firstName_idx" ON "Patient"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Patient_dateOfBirth_idx" ON "Patient"("dateOfBirth");

-- CreateIndex
CREATE INDEX "PatientContact_patientId_idx" ON "PatientContact"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_number_key" ON "Room"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_hospitalizationId_key" ON "Bed"("hospitalizationId");

-- CreateIndex
CREATE INDEX "Appointment_scheduledAt_idx" ON "Appointment"("scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "VitalSign_patientId_type_recordedAt_idx" ON "VitalSign"("patientId", "type", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "Consultation"("appointmentId");

-- CreateIndex
CREATE INDEX "Consultation_patientId_status_idx" ON "Consultation"("patientId", "status");

-- CreateIndex
CREATE INDEX "Consultation_providerId_idx" ON "Consultation"("providerId");

-- CreateIndex
CREATE INDEX "Prescription_patientId_status_idx" ON "Prescription"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Medication_code_key" ON "Medication"("code");

-- CreateIndex
CREATE INDEX "LabRequest_status_idx" ON "LabRequest"("status");

-- CreateIndex
CREATE INDEX "LabResult_resultCode_idx" ON "LabResult"("resultCode");

-- CreateIndex
CREATE INDEX "ImagingRequest_status_idx" ON "ImagingRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ImagingReport_imagingRequestId_key" ON "ImagingReport"("imagingRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatingRoom_name_key" ON "OperatingRoom"("name");

-- CreateIndex
CREATE INDEX "Surgery_status_idx" ON "Surgery"("status");

-- CreateIndex
CREATE INDEX "Surgery_scheduledAt_idx" ON "Surgery"("scheduledAt");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Notification_recipientId_status_idx" ON "Notification"("recipientId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_patientId_idx" ON "AuditLog"("patientId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceUnit" ADD CONSTRAINT "ServiceUnit_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTarif" ADD CONSTRAINT "ServiceTarif_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceStaff" ADD CONSTRAINT "ServiceStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceResponsable" ADD CONSTRAINT "ServiceResponsable_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceResponsable" ADD CONSTRAINT "ServiceResponsable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_receptionistId_fkey" FOREIGN KEY ("receptionistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientContact" ADD CONSTRAINT "PatientContact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_serviceUnitId_fkey" FOREIGN KEY ("serviceUnitId") REFERENCES "ServiceUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistory" ADD CONSTRAINT "MedicalHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistory" ADD CONSTRAINT "MedicalHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceUnitId_fkey" FOREIGN KEY ("serviceUnitId") REFERENCES "ServiceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_nurseInChargeId_fkey" FOREIGN KEY ("nurseInChargeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_physicianId_fkey" FOREIGN KEY ("physicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospitalization" ADD CONSTRAINT "Hospitalization_serviceUnitId_fkey" FOREIGN KEY ("serviceUnitId") REFERENCES "ServiceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "Hospitalization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionLine" ADD CONSTRAINT "PrescriptionLine_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionLine" ADD CONSTRAINT "PrescriptionLine_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispense" ADD CONSTRAINT "PharmacyDispense_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispense" ADD CONSTRAINT "PharmacyDispense_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispenseLine" ADD CONSTRAINT "PharmacyDispenseLine_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyDispenseLine" ADD CONSTRAINT "PharmacyDispenseLine_pharmacyDispenseId_fkey" FOREIGN KEY ("pharmacyDispenseId") REFERENCES "PharmacyDispense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequest" ADD CONSTRAINT "LabRequest_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequest" ADD CONSTRAINT "LabRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabRequest" ADD CONSTRAINT "LabRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_labRequestId_fkey" FOREIGN KEY ("labRequestId") REFERENCES "LabRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingRequest" ADD CONSTRAINT "ImagingRequest_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingRequest" ADD CONSTRAINT "ImagingRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingRequest" ADD CONSTRAINT "ImagingRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingReport" ADD CONSTRAINT "ImagingReport_imagingRequestId_fkey" FOREIGN KEY ("imagingRequestId") REFERENCES "ImagingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingReport" ADD CONSTRAINT "ImagingReport_interpretedById_fkey" FOREIGN KEY ("interpretedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_anesthesiologistId_fkey" FOREIGN KEY ("anesthesiologistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_operatingRoomId_fkey" FOREIGN KEY ("operatingRoomId") REFERENCES "OperatingRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Surgery" ADD CONSTRAINT "Surgery_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
