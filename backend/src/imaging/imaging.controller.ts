import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
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
