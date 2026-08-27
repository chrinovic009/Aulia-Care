import { ArrayUnique, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoomDto {
  @IsString() @MaxLength(80) number!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(240) location!: string;
  @IsString() serviceUnitId!: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) staffUserIds?: string[];
}

export class UpdateRoomDto {
  @IsOptional() @IsString() @MaxLength(80) number?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(240) location?: string;
  @IsOptional() @IsString() serviceUnitId?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) staffUserIds?: string[];
}
