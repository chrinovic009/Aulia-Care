import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabTestConsumableRequirementDto {
  @IsNotEmpty()
  @IsString()
  labTestId: string;

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
