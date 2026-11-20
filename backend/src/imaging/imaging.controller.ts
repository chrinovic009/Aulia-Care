import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ImagingService } from './imaging.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateImagingCatalogueDto } from './dto/create-imaging-catalogue.dto';
import { AmendImagingReportDto } from './dto/amend-imaging-report.dto';
import { SaveImagingReportDto } from './dto/save-imaging-report.dto';
import { AuthenticatedActor } from '../core/clinic-context.service';
import { AuditRead } from '../audit/audit-read.decorator';
import { PHOTO_MAX_BYTES, type MediaUpload } from '../messages/message-media.service';

interface AuthenticatedRequest {
  user?: AuthenticatedActor;
}

const IMAGING_READ_ROLES = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST'] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('imaging')
export class ImagingController {
  constructor(private readonly imagingService: ImagingService) {}

  @Get()
  @Roles(...IMAGING_READ_ROLES)
  findAll(@Request() req: AuthenticatedRequest) {
    return this.imagingService.findAll(req.user?.userId || req.user?.id);
  }

  @Get('catalogue')
  @Roles(...IMAGING_READ_ROLES)
  findCatalogue(@Request() req: AuthenticatedRequest) {
    return this.imagingService.findCatalogue(req.user?.userId || req.user?.id);
  }

  @Post('catalogue')
  @Roles('RADIOLOGIST')
  createCatalogue(@Body() body: CreateImagingCatalogueDto, @Request() req: AuthenticatedRequest) {
    return this.imagingService.createCatalogue(body, req.user?.userId || req.user?.id);
  }

  @Delete('catalogue/:id')
  @Roles('RADIOLOGIST')
  removeCatalogue(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.imagingService.removeCatalogue(id, req.user?.userId || req.user?.id);
  }

  @Get('dashboard/overview')
  @Roles(...IMAGING_READ_ROLES)
  getDashboardOverview(@Query('period') period?: string, @Query('modality') modality?: string, @Query('service') service?: string, @Request() req?: AuthenticatedRequest) {
    return this.imagingService.getDashboardOverview(period, modality, service, req?.user?.userId || req?.user?.id);
  }

  @Get('machines')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  findMachines(@Request() req: AuthenticatedRequest) {
    return this.imagingService.findMachines(req.user?.userId || req.user?.id);
  }

  @Post('machines')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  createMachine(@Body() body: { name: string; roomNumber?: string; isOperational?: boolean }, @Request() req: AuthenticatedRequest) {
    return this.imagingService.createMachine(body, req.user?.userId || req.user?.id);
  }

  @Get(':id')
  @Roles(...IMAGING_READ_ROLES)
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.imagingService.findOne(id, req.user?.userId || req.user?.id);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @Request() req: AuthenticatedRequest) {
    return this.imagingService.updateStatus(id, body.status, req.user?.userId || req.user?.id);
  }

  @Post(':id/report/previews')
  @Roles('RADIOLOGIST')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_MAX_BYTES, files: 1 } }))
  addReportPreview(@Param('id') id: string, @UploadedFile() file: MediaUpload | undefined, @Request() req: AuthenticatedRequest) {
    if (!file) throw new BadRequestException('Choisissez un aperçu JPEG, PNG ou WebP.');
    return this.imagingService.addReportPreview(id, file, req.user?.userId || req.user?.id);
  }

  @Get(':id/report/previews/:index')
  @Roles(...IMAGING_READ_ROLES)
  @AuditRead('ImagingRequest', 'id')
  async getReportPreview(@Param('id') id: string, @Param('index') index: string, @Res({ passthrough: true }) response: Response, @Request() req: AuthenticatedRequest) {
    const preview = await this.imagingService.getReportPreview(id, index, req.user?.userId || req.user?.id);
    const extension = preview.mimeType === 'image/jpeg' ? 'jpg' : preview.mimeType.split('/')[1];
    response.setHeader('Content-Type', preview.mimeType);
    response.setHeader('Content-Length', preview.size);
    response.setHeader('Content-Disposition', `inline; filename="apercu-${Number(index) + 1}.${extension}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(preview.stream);
  }

  @Post(':id/report')
  @Roles('RADIOLOGIST')
  saveReport(@Param('id') id: string, @Body() body: SaveImagingReportDto, @Request() req: AuthenticatedRequest) {
    return this.imagingService.saveReport(id, body, req.user?.userId);
  }

  @Post(':id/report/amendments')
  @Roles('RADIOLOGIST')
  amendReport(@Param('id') id: string, @Body() body: AmendImagingReportDto, @Request() req: AuthenticatedRequest) {
    return this.imagingService.amendReport(id, body, req.user?.userId || req.user?.id);
  }
}
