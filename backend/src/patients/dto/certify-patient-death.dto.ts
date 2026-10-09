import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CertifyPatientDeathDto {
  @IsISO8601()
  occurredAt!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  causeOfDeath!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalSummary?: string;
}
