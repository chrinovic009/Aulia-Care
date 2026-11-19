import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateOwnAppointmentDto {
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledAt!: string;

  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
