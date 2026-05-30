import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ConsultationStatus, EncounterType } from '@prisma/client';

export class UpdateConsultationDto {
  @IsString()
  @IsOptional()
  patientId?: string;

  @IsString()
  @IsOptional()
  appointmentId?: string;

  @IsString()
  @IsOptional()
  hospitalizationId?: string;

  @IsString()
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
