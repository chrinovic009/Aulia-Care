import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ConsultationStatus, EncounterType } from '@prisma/client';

export class CreateConsultationDto {
  @IsUUID()
  patientId: string;

  @IsUUID()
  @IsNotEmpty()
  appointmentId: string;

  @IsUUID()
  @IsOptional()
  hospitalizationId?: string;

  // The service ignores this field and uses the authenticated physician.
  @IsUUID()
  @IsOptional()
  providerId?: string;

  @IsEnum(ConsultationStatus)
  @IsOptional()
  status?: ConsultationStatus;

  @IsEnum(EncounterType)
  @IsOptional()
  encounterType?: EncounterType;

  @IsString()
  @IsOptional()
  chiefComplaint?: string;

  @IsString()
  @IsOptional()
  clinicalSummary?: string;

  @IsString()
  @IsOptional()
  diagnosis?: string;

  @IsString()
  @IsOptional()
  assessment?: string;

  @IsString()
  @IsOptional()
  plan?: string;
}
