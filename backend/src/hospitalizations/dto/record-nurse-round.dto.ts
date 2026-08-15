import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordNurseRoundDto {
  @IsOptional() @IsIn(['done', 'observation', 'problem']) action?: 'done' | 'observation' | 'problem';
  @IsOptional() @IsString() @MaxLength(2000) observation?: string;
  @IsOptional() @IsString() @MaxLength(2000) problem?: string;
  @IsOptional() @IsBoolean() escalated?: boolean;
}
