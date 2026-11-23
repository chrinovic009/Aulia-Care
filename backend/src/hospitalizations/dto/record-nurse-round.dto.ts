import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordNurseRoundDto {
  @IsOptional() @IsIn(['done', 'observation', 'problem']) action?: 'done' | 'observation' | 'problem';
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
  @IsOptional() @IsString() @MaxLength(2000) problem?: string;
  @IsOptional() @IsBoolean() escalated?: boolean;
  /** Real time of the observation when it was recorded offline and sent later (72 h at most). */
  @IsOptional() @IsDateString() performedAt?: string;
}
