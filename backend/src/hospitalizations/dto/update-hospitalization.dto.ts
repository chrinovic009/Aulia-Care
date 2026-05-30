import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateHospitalizationDto {
  @IsString()
  @IsOptional()
  patientId?: string;

  @IsString()
  @IsOptional()
  serviceUnitId?: string;

  @IsDateString()
  @IsOptional()
  admittedAt?: string;

  @IsString()
  @IsOptional()
  admissionReason?: string;

  @IsString()
  @IsOptional()
  dischargeReason?: string;

  @IsString()
  @IsOptional()
  bedNumber?: string;

  @IsString()
  @IsOptional()
  physicianId?: string;

  @IsString()
  @IsOptional()
  nurseInChargeId?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
