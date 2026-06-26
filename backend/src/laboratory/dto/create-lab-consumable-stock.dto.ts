import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabConsumableStockDto {
  @IsNotEmpty()
  @IsString()
  labConsumableId: string;

  @IsNotEmpty()
  @IsString()
  quantity: string;

  @IsOptional()
  @IsString()
  minimumLevel?: string;

  @IsOptional()
  @IsString()
  criticalLevel?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
