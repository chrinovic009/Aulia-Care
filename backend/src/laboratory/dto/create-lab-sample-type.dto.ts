import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabSampleTypeDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  labTestId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
