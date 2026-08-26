import { IsString, Length, Matches } from 'class-validator';

export class ChangePinDto {
  /** Account password before the first PIN exists, then the current PIN. */
  @IsString()
  @Length(1, 128)
  currentPin!: string;

  @IsString()
  @Matches(/^\d{4,6}$/, { message: 'Le nouveau code PIN doit contenir entre 4 et 6 chiffres.' })
  nextPin!: string;
}
