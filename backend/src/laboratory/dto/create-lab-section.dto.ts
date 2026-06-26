import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabSectionDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  order?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
