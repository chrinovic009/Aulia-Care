import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProvisionedSuperAdminDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,80}$/)
  username!: string;

  @IsString()
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MaxLength(120)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  bio?: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}