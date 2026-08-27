import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class ShiftHandoverDecisionDto {
  @IsIn(['LEAVE', 'REMIND'])
  decision!: 'LEAVE' | 'REMIND';

  @ValidateIf((dto: ShiftHandoverDecisionDto) => dto.decision === 'REMIND')
  @IsInt()
  @Min(5)
  @Max(15)
  reminderMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
