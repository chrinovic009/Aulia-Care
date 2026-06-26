import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLabTestSampleRequirementDto {
  @IsNotEmpty()
  @IsString()
  labTestId: string;

  @IsNotEmpty()
  @IsString()
  labSampleTypeId: string;

  @IsOptional()
  @IsString()
  volumeRequired?: string;

  @IsOptional()
  @IsString()
  volumeUnit?: string;

  @IsOptional()
  @IsString()
  storageCondition?: string;

  @IsOptional()
  @IsString()
  maxAgeMinutes?: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}
