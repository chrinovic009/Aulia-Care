import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RecordVitalSignsDto {
  @IsString()
  @IsOptional()
  temperature?: string;

  @IsString()
  @IsOptional()
  bloodPressure?: string;

  @IsString()
  @IsOptional()
  spo2?: string;

  @IsString()
  @IsOptional()
  heartRate?: string;

  @IsString()
  @IsOptional()
  respiratoryRate?: string;

  @IsString()
  @IsOptional()
  weight?: string;

  @IsString()
  @IsOptional()
  height?: string;

  @IsString()
  @IsOptional()
  chestCircumference?: string;

  @IsString()
  @IsOptional()
  armCircumference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  physicianId?: string;

  /** Saves the measurements and explicitly hands the patient to a physician. */
  @IsBoolean()
  @IsOptional()
  finalizeTriage?: boolean;

  /** Required acknowledgement for physiologically suspicious, but possible, values. */
  @IsBoolean()
  @IsOptional()
  confirmSuspectValues?: boolean;
}
