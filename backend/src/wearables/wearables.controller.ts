import { Body, Controller, Get, Param, Post, Patch, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WearablesService } from './wearables.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wearables')
export class WearablesController {
  constructor(private readonly wearables: WearablesService) {}

  @Post('devices')
  @Roles('SUPER_ADMIN', 'ADMIN')
  registerDevice(@Body() body: any, @Request() req: any) {
    return this.wearables.registerDevice(body, req.user?.userId);
  }

  @Get('reception/dashboard')
  @Roles('RECEPTIONIST')
  receptionDashboard(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.wearables.getReceptionDashboard(Number(page || 1), Number(limit || 10));
  }

  @Post('reception/pair')
  @Roles('RECEPTIONIST')
  pairAtReception(@Body() body: any, @Request() req: any) {
    return this.wearables.pairDeviceAtReception(body, req.user?.userId);
  }

  @Get('admin/inventory')
  @Roles('SUPER_ADMIN', 'ADMIN')
  inventory(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.wearables.getInventoryDashboard(Number(page || 1), Number(limit || 10));
  }

  @Patch('admin/plans/:manufacturer')
  @Roles('SUPER_ADMIN', 'ADMIN')
  savePlan(@Param('manufacturer') manufacturer: string, @Body() body: any) {
    return this.wearables.savePlan(manufacturer, body);
  }

  @Post('admin/lots')
  @Roles('SUPER_ADMIN', 'ADMIN')
  receiveLot(@Body() body: any, @Request() req: any) {
    return this.wearables.receiveLot(body, req.user?.userId);
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

  @Get('parent-child-links/me')
  @Roles('PATIENT')
  myChildren(@Request() req: any) {
    return this.wearables.listMyChildren(req.user?.userId);
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
