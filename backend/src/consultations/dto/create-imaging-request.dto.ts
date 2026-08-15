import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ImagingModality, ImagingRequestStatus } from '@prisma/client';

export class CreateImagingRequestDto {
  @IsString()
  @IsNotEmpty()
  consultationId: string;

  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsOptional()
  imagingCatalogueId?: string;

  /** Backwards-compatible catalogue lookup for existing consultation forms. */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  examName?: string;

  @IsEnum(ImagingModality)
  @IsOptional()
  modality?: ImagingModality;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  examSubType?: string;

  @IsString()
  @IsNotEmpty()
  bodyPart: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  laterality?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  clinicalIndication?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  urgency?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  contraindications?: string;

  @IsBoolean()
  @IsOptional()
  contrastAgentUsed?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  contrastDetails?: string;

  @IsBoolean()
  @IsOptional()
  informedConsentConfirmed?: boolean;

  @IsBoolean()
  @IsOptional()
  pregnancyScreened?: boolean;

  @IsBoolean()
  @IsOptional()
  renalFunctionVerified?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(1_000)
  duplicateOverrideReason?: string;

  @IsArray()
  @IsOptional()
  availableIncidences?: string[];

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  protocolNotes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @IsOptional()
  machineId?: string;

  @IsString()
  @IsOptional()
  scheduledAt?: string;

  @IsEnum(ImagingRequestStatus)
  @IsOptional()
  status?: ImagingRequestStatus;
}
