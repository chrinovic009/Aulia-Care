import { EstablishmentType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class CreateProvisionedClinicDto {
  @IsString() @MaxLength(160)
  name!: string;

  @IsOptional() @IsString() @MaxLength(160)
  brandDisplayName?: string;

  @IsEnum(EstablishmentType)
  establishmentType!: EstablishmentType;

  @IsOptional() @IsString() @MaxLength(700_000)
  documentLogoUrl?: string;

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

  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string;

  @IsOptional() @IsString() @MaxLength(240)
  website?: string;

  @IsOptional() @IsString() @MaxLength(120)
  country?: string;

  @IsOptional() @IsString() @MaxLength(120)
  province?: string;

  @IsOptional() @IsString() @MaxLength(120)
  city?: string;

  @IsOptional() @IsString() @MaxLength(120)
  neighborhood?: string;

  @IsOptional() @IsString() @MaxLength(240)
  address?: string;

  @IsOptional() @Matches(/^[A-Za-z_]+\/[A-Za-z_]+$/, { message: 'La timezone doit être un identifiant IANA, par exemple Africa/Lubumbashi.' })
  timezone?: string;

  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: 'La devise doit être un code ISO à trois lettres.' })
  currency?: string;

  @IsOptional() @IsString() @MaxLength(500)
  documentFooter?: string;
}
