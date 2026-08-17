import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';

export class TelehealthTranscriptEntryDto {
  @IsIn(['MEDECIN', 'PATIENT'])
  speaker: 'MEDECIN' | 'PATIENT';

  @IsString()
  @MaxLength(4_000)
  text: string;

  @IsDateString()
  at: string;
}

/** The transcript is a draft aid, never a signed medical conclusion. */
export class SaveTelehealthTranscriptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelehealthTranscriptEntryDto)
  entries: TelehealthTranscriptEntryDto[];
}
