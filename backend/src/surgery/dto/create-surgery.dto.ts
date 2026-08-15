import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Minimum safe planning contract. The server verifies ownership and room collision. */
export class CreateSurgeryDto {
  @IsUUID() patientId: string;
  @IsUUID() consultationId: string;
  @IsUUID() operatingRoomId: string;
  @IsDateString() scheduledAt: string;
  @IsString() @IsNotEmpty() @MaxLength(255) procedureName: string;
  @IsString() @IsNotEmpty() @MaxLength(4_000) indication: string;
  @IsOptional() @IsString() @MaxLength(4_000) postoperativePlan?: string;
  @IsOptional() @IsUUID() anesthesiologistId?: string;
}
