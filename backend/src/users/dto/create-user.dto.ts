import {
  IsEmail,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { RoleSlug, UserStatus } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(RoleSlug)
  primaryRole: RoleSlug;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  // 🔥 AJOUTS POUR TON SUPER ADMIN
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsappUrl?: string;
  @IsOptional() @IsString() facebookUrl?: string;
  @IsOptional() @IsString() instagramUrl?: string;
  @IsOptional() @IsString() linkedinUrl?: string;

  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() addressCountry?: string;
  @IsOptional() @IsString() addressProvince?: string;
  @IsOptional() @IsString() addressCity?: string;
  @IsOptional() @IsString() addressNeighborhood?: string;
  @IsOptional() @IsString() addressStreet?: string;

  @IsOptional() @IsString() bio?: string;

  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() employeeNumber?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() serviceUnitId?: string;
  @IsOptional() @IsString() contractType?: string;
  @IsOptional() @IsNumber() salary?: number;
  @IsOptional() @IsString() salaryFrequency?: string;
  @IsOptional() @IsDateString() shiftStartAt?: string;
  @IsOptional() @IsDateString() shiftEndAt?: string;
  @IsOptional() @IsString() shiftType?: string;
}
