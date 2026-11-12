import { IsDateString, IsOptional, IsString } from 'class-validator';

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

  /** When the measurement was taken, for entries made offline and sent later. */
  @IsDateString()
  @IsOptional()
  measuredAt?: string;
}
