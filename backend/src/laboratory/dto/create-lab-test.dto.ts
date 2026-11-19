import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  /**
   * Prix propre à l'établissement.
   * Aucun prix global Aulia n'est utilisé.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price?: number;

  /**
   * Délai indicatif de rendu de l'examen, en minutes,
   * propre à l'établissement.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  turnaroundTimeMinutes?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}