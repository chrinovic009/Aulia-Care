import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateNursingCareTaskDto {
  @IsString() @MaxLength(255) title: string;
  @IsDateString() dueAt: string;
  @IsOptional() @IsUUID() assignedNurseId?: string;
  @IsOptional() @IsUUID() prescriptionLineId?: string;
  @IsOptional() @IsString() @MaxLength(2_000) instructions?: string;
}
