import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateClinicOperationalPolicyDto {
  @IsOptional() @IsString()
  timezone?: string;

  @IsOptional() @IsString()
  dayShiftStart?: string;

  @IsOptional() @IsString()
  dayShiftEnd?: string;

  @IsOptional() @IsString()
  nightShiftStart?: string;

  @IsOptional() @IsString()
  nightShiftEnd?: string;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  defaultNursePatientCapacity?: number;

  @IsOptional() @IsBoolean()
  autoNurseRelayEnabled?: boolean;

  @IsOptional() @IsString()
  reason?: string;
}
