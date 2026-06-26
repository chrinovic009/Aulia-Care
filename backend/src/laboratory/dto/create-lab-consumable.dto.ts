import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabConsumableDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  unit: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
