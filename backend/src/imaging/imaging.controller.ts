import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ImagingService } from './imaging.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('imaging')
export class ImagingController {
  constructor(private readonly imagingService: ImagingService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST')
  findAll() {
    return this.imagingService.findAll();
  }

  @Get('catalogue')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST')
  findCatalogue() {
    return this.imagingService.findCatalogue();
  }

  @Get('dashboard/overview')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST')
  getDashboardOverview(@Query('period') period?: string, @Query('modality') modality?: string, @Query('service') service?: string) {
    return this.imagingService.getDashboardOverview(period, modality, service);
  }

  @Get('machines')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  findMachines() {
    return this.imagingService.findMachines();
  }

  @Post('machines')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  createMachine(@Body() body: { name: string; roomNumber?: string; isOperational?: boolean }) {
    return this.imagingService.createMachine(body);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'RADIOLOGIST')
  findOne(@Param('id') id: string) {
    return this.imagingService.findOne(id);
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.imagingService.updateStatus(id, body.status);
  }

  @Post(':id/report')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST')
  saveReport(@Param('id') id: string, @Body() body: { findings: string; impression: string; recommendations?: string; verified?: boolean }, @Request() req: any) {
    return this.imagingService.saveReport(id, body, req.user?.userId);
  }
}
