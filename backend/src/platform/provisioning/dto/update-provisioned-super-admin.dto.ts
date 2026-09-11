import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Tenant membership and role are deliberately absent from this DEV-only DTO. */
export class UpdateProvisionedSuperAdminDto {
  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string;

  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9._-]{3,80}$/)
  username?: string;

  @IsOptional() @IsString() @MaxLength(120)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  lastName?: string;

  @IsOptional() @IsString() @MaxLength(60)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(2_000)
  bio?: string;

  /** Omit this field to keep the existing password. It is never returned. */
  @IsOptional() @IsString() @MinLength(12) @MaxLength(256)
  password?: string;
}
