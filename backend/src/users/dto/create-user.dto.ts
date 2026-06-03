import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { RoleSlug } from '@prisma/client';

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
}