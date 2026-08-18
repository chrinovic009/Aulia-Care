import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

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
  @IsUUID()
  sessionId: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TelehealthTranscriptEntryDto)
  entries: TelehealthTranscriptEntryDto[];
}
