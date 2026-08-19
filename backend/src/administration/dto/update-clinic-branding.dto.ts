import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Identity used on official documents for the authenticated clinic only. */
export class UpdateClinicBrandingDto {
  @IsOptional() @IsString() @MaxLength(100)
  brandDisplayName?: string;

  @IsOptional() @IsString() @MaxLength(700_000)
  documentLogoUrl?: string | null;

  @IsOptional() @IsString() @MaxLength(160)
  legalName?: string;

  @IsOptional() @IsString() @MaxLength(120)
  registrationNumber?: string;

  @IsOptional() @IsString() @MaxLength(120)
  rccmNumber?: string;

  @IsOptional() @IsString() @MaxLength(120)
  taxNumber?: string;

  @IsOptional() @IsString() @MaxLength(120)
  nationalIdNumber?: string;

  @IsOptional() @IsString() @MaxLength(60)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(254)
  email?: string;

  @IsOptional() @IsString() @MaxLength(240)
  address?: string;

  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @IsOptional() @IsString() @MaxLength(100)
  country?: string;

  @IsOptional() @IsString() @MaxLength(500)
  documentFooter?: string;
}
