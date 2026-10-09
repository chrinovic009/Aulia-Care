import { IsString, Matches } from 'class-validator';

export class SetMedicationSalePriceDto {
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, {
    message: 'Le tarif doit être un montant CDF positif avec au plus deux décimales.',
  })
  amount!: string;
}
