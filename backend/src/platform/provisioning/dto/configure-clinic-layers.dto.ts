import { ArrayNotEmpty, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { AuliaLayer } from '@prisma/client';

export class ConfigureClinicLayersDto {
  @IsArray() @ArrayNotEmpty() @ArrayUnique()
  @IsEnum(AuliaLayer, { each: true })
  layers!: AuliaLayer[];
}
