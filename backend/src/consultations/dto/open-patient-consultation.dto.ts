import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Opens a new clinical encounter for a patient already visible to the physician. */
export class OpenPatientConsultationDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  chiefComplaint?: string;
}
