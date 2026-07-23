import { IsBoolean, IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { EmployeeShiftPattern, RoleSlug, UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsEnum(RoleSlug)
  @IsOptional()
  primaryRole?: RoleSlug;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @IsString()
  @IsOptional()
  specialty?: string;

  @IsString()
  @IsOptional()
  nationality?: string;

  @IsString()
  @IsOptional()
  addressCountry?: string;

  @IsString()
  @IsOptional()
  addressProvince?: string;

  @IsString()
  @IsOptional()
  addressCity?: string;

  @IsString()
  @IsOptional()
  addressNeighborhood?: string;

  @IsString()
  @IsOptional()
  addressStreet?: string;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  position?: string;

  @IsString()
  @IsOptional()
  employeeNumber?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  serviceUnitId?: string;

  @IsBoolean()
  @IsOptional()
  isResponsible?: boolean;

  @IsBoolean()
  @IsOptional()
  isDepartmentResponsible?: boolean;

  @IsString()
  @IsOptional()
  contractType?: string;

  @IsNumber()
  @IsOptional()
  salary?: number;

  @IsString()
  @IsOptional()
  salaryFrequency?: string;

  @IsDateString()
  @IsOptional()
  shiftStartAt?: string;

  @IsDateString()
  @IsOptional()
  shiftEndAt?: string;

  @IsString()
  @IsOptional()
  shiftType?: string;

  @IsEnum(EmployeeShiftPattern)
  @IsOptional()
  shiftPattern?: EmployeeShiftPattern;

  @IsDateString()
  @IsOptional()
  rotationAnchorAt?: string;
}
