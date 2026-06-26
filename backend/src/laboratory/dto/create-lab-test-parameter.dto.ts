import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LabResultType } from '@prisma/client';

export class CreateLabTestParameterDto {
  @IsNotEmpty()
  @IsString()
  labTestId: string;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsEnum(LabResultType)
  @IsOptional()
  resultType?: LabResultType;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsOptional()
  @IsString()
  minValue?: string;

  @IsOptional()
  @IsString()
  maxValue?: string;

  @IsOptional()
  @IsString()
  order?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
