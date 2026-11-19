import { IsEmail, IsOptional, IsString } from 'class-validator';

/** Contact data is deliberately separate from the patient record. */
export class UpsertPatientContactDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
