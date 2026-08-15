import { ConsultationStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Bounded contract for the consultation editor; unknown top-level fields are rejected. */
export class ClinicalSectionsDto {
  @IsOptional() @IsString() @MaxLength(2_000) chiefComplaint?: string;
  @IsOptional() @IsObject() medicalHistory?: Record<string, unknown>;
  @IsOptional() @IsObject() currentSymptoms?: Record<string, unknown>;
  @IsOptional() @IsObject() clinicalExam?: Record<string, unknown>;
  @IsOptional() @IsObject() diagnosis?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(2_000) diagnosisText?: string;
  @IsOptional() @IsObject() treatmentPlan?: Record<string, unknown>;
  @IsOptional() @IsObject() followUp?: Record<string, unknown>;
  @IsOptional() @IsObject() complementaryExams?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(8_000) complementaryAnamnesis?: string;
  @IsOptional() @IsObject() consultationModule?: Record<string, unknown>;
  @IsOptional() @IsObject() clinicalSummary?: Record<string, unknown>;
  @IsOptional() @IsObject() validationSummary?: Record<string, unknown>;
  @IsOptional() @IsEnum(ConsultationStatus) status?: ConsultationStatus;
  @IsOptional() @IsBoolean() attestation?: boolean;
  @IsOptional() @IsString() @MaxLength(1_000) amendmentReason?: string;
}
