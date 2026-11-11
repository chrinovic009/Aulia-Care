import { Body, Controller, Param, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IntelligenceService } from './intelligence.service';
import { AuliaLayer } from '@prisma/client';
import { RequireLayer } from '../platform/layers/require-layer.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('intelligence')
@RequireLayer(AuliaLayer.DIAGNOSTIC)
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}

  @Post('consultations/:id/analyse')
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  analyseConsultation(@Param('id') id: string, @Body() body: { transcript: string }, @Request() req: any) {
    return this.intelligence.analyseConsultation(id, body?.transcript, req.user);
  }

  @Post('patients/duplicate-candidates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  duplicateCandidates(@Body() body: any, @Request() req: any) {
    return this.intelligence.findDuplicateCandidates(body, req.user);
  }

  @Post('subscriptions/extract-pdf')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  extractCompanyPdf(@UploadedFile() file: any) { return this.intelligence.extractCompanyDocument(file); }
}
