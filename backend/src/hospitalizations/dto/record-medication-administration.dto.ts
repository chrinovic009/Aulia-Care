import { MedicationAdministrationStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RecordMedicationAdministrationDto {
  @IsUUID() prescriptionLineId: string;
  @IsEnum(MedicationAdministrationStatus) status: MedicationAdministrationStatus;
  @IsOptional() @IsString() @MaxLength(255) doseGiven?: string;
  @IsOptional() @IsString() @MaxLength(1_000) reason?: string;
  @IsOptional() @IsString() @MaxLength(2_000) observation?: string;
  /** Real time of the dose when it was recorded offline and sent later (72 h at most). */
  @IsOptional() @IsDateString() administeredAt?: string;
}
