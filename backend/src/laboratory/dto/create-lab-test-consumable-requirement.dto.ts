import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabTestConsumableRequirementDto {
  @IsOptional()
  @IsString()
  labTestId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsNotEmpty()
  @IsString()
  labConsumableId: string;

  @IsNotEmpty()
  @IsString()
  quantity: string;

  @IsOptional()
  @IsString()
  unit?: string;
}
