import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportPatientDeathDto {
  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
