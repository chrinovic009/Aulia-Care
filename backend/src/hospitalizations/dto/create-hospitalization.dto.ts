import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateHospitalizationDto {
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @IsString()
  @IsOptional()
  serviceUnitId?: string;

  @IsDateString()
  @IsOptional()
  admittedAt?: string;

  @IsString()
  @IsNotEmpty()
  admissionReason: string;

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
