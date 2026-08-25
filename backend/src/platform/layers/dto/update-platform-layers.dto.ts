import { ArrayNotEmpty, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { AuliaLayer } from '@prisma/client';

export class UpdatePlatformLayersDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Sélectionnez au moins une couche Aulia Care.' })
  @ArrayUnique({ message: 'Une couche ne peut être choisie qu’une seule fois.' })
  @IsEnum(AuliaLayer, { each: true, message: 'Couche invalide.' })
  layers!: AuliaLayer[];
}
