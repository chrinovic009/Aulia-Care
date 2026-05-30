import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleSlug } from '@prisma/client';

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
}
