import { MedicationAdministrationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RecordMedicationAdministrationDto {
  @IsUUID() prescriptionLineId: string;
  @IsEnum(MedicationAdministrationStatus) status: MedicationAdministrationStatus;
  @IsOptional() @IsString() @MaxLength(255) doseGiven?: string;
  @IsOptional() @IsString() @MaxLength(1_000) reason?: string;
  @IsOptional() @IsString() @MaxLength(2_000) observation?: string;
}
