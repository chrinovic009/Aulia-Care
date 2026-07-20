import { Body, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IntelligenceService } from './intelligence.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Post('consultations/:id/analyse')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  analyseConsultation(@Param('id') id: string, @Body() body: { transcript: string }) { return this.intelligence.analyseConsultation(id, body.transcript); }

  @Post('patients/duplicate-candidates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  duplicateCandidates(@Body() body: any) { return this.intelligence.findDuplicateCandidates(body); }

  @Post('subscriptions/extract-pdf')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  extractCompanyPdf(@UploadedFile() file: any) { return this.intelligence.extractCompanyDocument(file); }
}
