import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLabRequestDto {
  @IsOptional() @IsUUID() labTestId?: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) labTestIds?: string[];
  @IsOptional() @IsString() @MaxLength(250) examName?: string;
  @IsOptional() @IsString() @MaxLength(250) specimenType?: string;
  @IsOptional() @IsString() @MaxLength(30) priority?: string;
  @IsOptional() @IsString() @MaxLength(4_000) notes?: string;
}
