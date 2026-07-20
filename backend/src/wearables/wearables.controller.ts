import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WearablesService } from './wearables.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wearables')
export class WearablesController {
  constructor(private readonly wearables: WearablesService) {}

  @Post('devices')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN')
  registerDevice(@Body() body: any, @Request() req: any) {
    return this.wearables.registerDevice(body, req.user?.userId);
  }

  @Post('parent-child-links')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createParentChildLink(@Body() body: any, @Request() req: any) {
    return this.wearables.createParentChildLink(body, req.user?.userId);
  }

  @Post('parent-child-links/confirm')
  @Roles('PATIENT')
  confirmParentChildLink(@Body() body: any, @Request() req: any) {
    return this.wearables.confirmParentChildLink(String(body?.token || ''), req.user?.userId);
  }

  @Post('devices/:deviceId/measurements')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN')
  ingestMeasurement(@Param('deviceId') deviceId: string, @Body() body: any, @Request() req: any) {
    return this.wearables.ingestMeasurement(deviceId, body, req.user?.userId);
  }

  @Post('devices/:deviceId/locations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN')
  ingestLocation(@Param('deviceId') deviceId: string, @Body() body: any, @Request() req: any) {
    return this.wearables.ingestLocation(deviceId, body, req.user?.userId);
  }

  @Post('patients/:patientId/location-requests')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN', 'PATIENT')
  requestLocation(@Param('patientId') patientId: string, @Body() body: any, @Request() req: any) {
    return this.wearables.requestEmergencyLocation(patientId, body, req.user);
  }

  @Get('patients/:patientId/dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN', 'PATIENT')
  dashboard(@Param('patientId') patientId: string, @Request() req: any) {
    return this.wearables.getPatientDashboard(patientId, req.user);
  }
}
