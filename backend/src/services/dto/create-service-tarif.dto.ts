import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateServiceTarifDto {
  @IsNotEmpty()
  serviceId: string;

  @IsNotEmpty()
  @IsNumber()
  prix: number;

  @IsOptional()
  dateDebut?: Date;

  @IsOptional()
  dateFin?: Date;

  @IsOptional()
  actif?: boolean;
}
