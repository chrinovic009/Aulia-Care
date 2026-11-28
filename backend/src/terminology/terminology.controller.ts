import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TerminologyService } from './terminology.service';

class ImportTerminologyDto {
  @IsIn(['ICD10', 'LOINC']) system: 'ICD10' | 'LOINC';
  /** UTF-8 text, one code per line: code;libellé[;code parent]. */
  @IsString() @MaxLength(20_000_000) file: string;
  @IsOptional() @IsString() @MaxLength(60) version?: string;
}

type Authed = { user?: { userId?: string } };

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('terminology')
export class TerminologyController {
  constructor(private readonly terminology: TerminologyService) {}

  @Get('search')
  search(@Query('system') system: string | undefined, @Query('q') q: string | undefined) {
    return this.terminology.search(system, q);
  }

  @Get('statistics/diagnoses')
  @Roles('ADMIN', 'SUPER_ADMIN', 'MEDICAL_DIRECTOR', 'FINANCE', 'PHYSICIAN')
  statistics(@Query('days') days: string | undefined, @Request() req: Authed) {
    return this.terminology.diagnosisStatistics(Number(days) || 30, req.user?.userId);
  }

  @Post('import')
  @Roles('DEV')
  import(@Body() dto: ImportTerminologyDto, @Request() req: Authed) {
    return this.terminology.import(dto.system, dto.file, dto.version, req.user?.userId);
  }
}
