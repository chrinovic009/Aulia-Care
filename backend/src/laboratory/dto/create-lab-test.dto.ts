import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { GenderRestriction, LabResultType } from '@prisma/client';

export class CreateLabTestDto {
  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  categoryId: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  price: string;

  @IsOptional()
  @IsString()
  turnaroundTimeMinutes?: string;

  @IsEnum(LabResultType)
  resultType: LabResultType;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsEnum(GenderRestriction)
  @IsOptional()
  genderRestriction?: GenderRestriction;

  @IsOptional()
  @IsString()
  minAge?: string;

  @IsOptional()
  @IsString()
  maxAge?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
