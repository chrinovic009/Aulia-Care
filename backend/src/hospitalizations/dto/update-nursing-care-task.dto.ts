import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * A nurse may only close, declare missed, or escalate an already scheduled task.
 * The prescribing physician remains the only actor who can schedule or cancel care.
 */
export class UpdateNursingCareTaskDto {
  @IsIn(['COMPLETED', 'MISSED', 'ESCALATED'])
  status: 'COMPLETED' | 'MISSED' | 'ESCALATED';

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  observation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  escalationReason?: string;

  /** Real time of the care when it was recorded offline and sent later (72 h at most). */
  @IsOptional()
  @IsDateString()
  performedAt?: string;
}
