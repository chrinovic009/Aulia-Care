import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ImagingService } from './imaging.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateImagingCatalogueDto } from './dto/create-imaging-catalogue.dto';
import { AuthenticatedActor } from '../core/clinic-context.service';

interface AuthenticatedRequest {
  user?: AuthenticatedActor;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('imaging')
export class ImagingController {
  constructor(private readonly imagingService: ImagingService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST')
  findAll(@Request() req: AuthenticatedRequest) {
    return this.imagingService.findAll(req.user?.userId || req.user?.id);
  }

  @Get('catalogue')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST')
  findCatalogue(@Request() req: AuthenticatedRequest) {
    return this.imagingService.findCatalogue(req.user?.userId || req.user?.id);
  }

  @Post('catalogue')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  createCatalogue(@Body() body: CreateImagingCatalogueDto, @Request() req: AuthenticatedRequest) {
    return this.imagingService.createCatalogue(body, req.user?.userId || req.user?.id);
  }

  @Delete('catalogue/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  removeCatalogue(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.imagingService.removeCatalogue(id, req.user?.userId || req.user?.id);
  }

  @Get('dashboard/overview')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST')
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.imagingService.findOne(id, req.user?.userId || req.user?.id);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @Request() req: AuthenticatedRequest) {
    return this.imagingService.updateStatus(id, body.status, req.user?.userId || req.user?.id);
  }

  @Post(':id/report')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  saveReport(@Param('id') id: string, @Body() body: { findings: string; impression: string; recommendations?: string; verified?: boolean }, @Request() req: AuthenticatedRequest) {
    return this.imagingService.saveReport(id, body, req.user?.userId);
  }
}
