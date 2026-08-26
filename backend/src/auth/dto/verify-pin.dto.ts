import { IsString, Matches } from 'class-validator';

export class VerifyPinDto {
  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'Le code PIN doit contenir entre 4 et 6 chiffres.' })
  pin!: string;
}
