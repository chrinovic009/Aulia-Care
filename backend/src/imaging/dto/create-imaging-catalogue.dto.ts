import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ImagingModality } from '@prisma/client';

export class CreateImagingCatalogueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(ImagingModality)
  modality: ImagingModality;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  category?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  preparationInstructions?: string;

  @IsArray()
  @IsOptional()
  availableIncidences?: string[];

  @IsBoolean()
  @IsOptional()
  supportsContrast?: boolean;

  @IsOptional()
  price?: number;

  @IsOptional()
  turnaroundTimeMinutes?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
