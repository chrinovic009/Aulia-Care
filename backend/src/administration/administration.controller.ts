import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdministrationService } from './administration.service';
import { UpdateClinicBrandingDto } from './dto/update-clinic-branding.dto';
import { UpdateClinicOperationalPolicyDto } from './dto/update-clinic-operational-policy.dto';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('administration')
export class AdministrationController {
  constructor(
    private readonly administrationService: AdministrationService,
  ) {}

  @Get('clinic-branding')
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'NURSE',
    'PHYSICIAN',
    'CASHIER',
    'FINANCE',
    'LAB_MANAGER',
    'LAB_TECHNICIAN',
    'RADIOLOGIST',
    'PHARMACIST',
    'PATIENT',
  )
  clinicBranding(@Request() req: any) {
    return this.administrationService.getClinicBranding(
      req.user?.userId,
    );
  }

  @Patch('clinic-branding')
  @Roles('SUPER_ADMIN')
  updateClinicBranding(
    @Request() req: any,
    @Body() body: UpdateClinicBrandingDto,
  ) {
    return this.administrationService.updateClinicBranding(
      req.user?.userId,
      body,
    );
  }

  @Get('clinic-operational-policy')
  @Roles('ADMIN')
  clinicOperationalPolicy(@Request() req: any) {
    return this.administrationService.getClinicOperationalPolicy(
      req.user?.userId,
    );
  }

  @Patch('clinic-operational-policy')
  @Roles('ADMIN')
  updateClinicOperationalPolicy(
    @Request() req: any,
    @Body() body: UpdateClinicOperationalPolicyDto,
  ) {
    return this.administrationService.updateClinicOperationalPolicy(
      req.user?.userId,
      body,
    );
  }

  @Get('departments')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN', 'RECEPTIONIST')
  departments(@Request() req: any) {
    return this.administrationService.departments(req.user?.userId);
  }

  @Get('service-units')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN')
  serviceUnits(@Request() req: any) {
    return this.administrationService.serviceUnits(req.user?.userId);
  }

  @Post('departments/:id/responsables')
  @Roles('SUPER_ADMIN', 'ADMIN')
  addDepartmentResponsables(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const items = Array.isArray(body) ? body : [body];

    return this.administrationService.addDepartmentResponsables(
      items.map((it) => ({
        ...it,
        departmentId: id,
      })),
      req.user?.userId,
    );
  }

  @Post('departments')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createDepartment(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.administrationService.createDepartment(
      body,
      req.user?.userId,
    );
  }

  @Patch('departments/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateDepartment(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.administrationService.updateDepartment(
      id,
      body,
      req.user?.userId,
    );
  }

  @Delete('departments/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteDepartment(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.administrationService.removeDepartment(
      id,
      req.user?.userId,
    );
  }

  @Post('service-units')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createServiceUnit(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.administrationService.createServiceUnit(
      body,
      req.user?.userId,
    );
  }

  @Get('rooms')
  @Roles('ADMIN')
  rooms(@Request() req: any) {
    return this.administrationService.rooms(req.user?.userId);
  }

  @Get('room-staff')
  @Roles('ADMIN')
  roomStaff(@Request() req: any) {
    return this.administrationService.roomStaff(req.user?.userId);
  }

  @Post('rooms')
  @Roles('ADMIN')
  createRoom(
    @Request() req: any,
    @Body() body: CreateRoomDto,
  ) {
    return this.administrationService.createRoom(
      body,
      req.user?.userId,
    );
  }

  @Patch('rooms/:id')
  @Roles('ADMIN')
  updateRoom(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: UpdateRoomDto,
  ) {
    return this.administrationService.updateRoom(
      id,
      body,
      req.user?.userId,
    );
  }

  @Delete('rooms/:id')
  @Roles('ADMIN')
  deleteRoom(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.administrationService.removeRoom(
      id,
      req.user?.userId,
    );
  }

  @Post('beds')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createBed(
    @Body()
    body: {
      roomId: string;
      code: string;
      status?: 'FREE' | 'OCCUPIED' | 'CLEANING' | 'RESERVED';
    },
    @Request() req: any,
  ) {
    return this.administrationService.createBed(
      body,
      req.user?.userId,
    );
  }

  @Post('operating-rooms')
  @Roles('SUPER_ADMIN', 'ADMIN')
  createOperatingRoom(
    @Body()
    body: {
      name?: string;
      location?: string;
      capacity?: number | string;
      active?: boolean;
    },
    @Request() req: any,
  ) {
    return this.administrationService.createOperatingRoom(
      body,
      req.user?.userId,
    );
  }

  @Patch('operating-rooms/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateOperatingRoom(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      location?: string;
      capacity?: number | string;
      active?: boolean;
    },
    @Request() req: any,
  ) {
    return this.administrationService.updateOperatingRoom(
      id,
      body,
      req.user?.userId,
    );
  }

  @Delete('operating-rooms/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  deleteOperatingRoom(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.administrationService.removeOperatingRoom(
      id,
      req.user?.userId,
    );
  }

  // ---------------------------------------------------------------------------
  // PHARMACIE / STOCK
  //
  // IMPORTANT :
  // l'identité de la clinique ne vient jamais du body envoyé par le frontend.
  // Elle sera déterminée dans AdministrationService à partir de l'utilisateur
  // authentifié.
  // ---------------------------------------------------------------------------

  @Get('stock')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHARMACIST')
  stock(@Request() req: any) {
    return this.administrationService.stockCatalog(
      req.user?.userId,
    );
  }

  @Post('stock/medications')
  @Roles('SUPER_ADMIN', 'PHARMACIST', 'PHYSICIAN')
  createMedication(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.administrationService.createMedication(
      body,
      req.user?.userId,
    );
  }

  @Post('stock/suppliers')
  @Roles('SUPER_ADMIN', 'PHARMACIST')
  createSupplier(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.administrationService.createSupplier(
      body,
      req.user?.userId,
    );
  }

  @Post('stock/lots')
  @Roles('SUPER_ADMIN', 'PHARMACIST', 'PHYSICIAN')
  createStockLot(
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.administrationService.createStockLot(
      body,
      req.user?.userId,
    );
  }

  @Get('reports')
  @Roles('SUPER_ADMIN', 'ADMIN')
  reports(@Request() req: any) {
    return this.administrationService.reports(req.user?.userId);
  }

  @Get('dashboard')
  @Roles('SUPER_ADMIN', 'ADMIN')
  dashboard(@Request() req: any) {
    return this.administrationService.dashboard(req.user?.userId);
  }

  /** Vue consolidée réservée à la direction de la plateforme. */
  @Get('executive-dashboard')
  @Roles('SUPER_ADMIN')
  executiveDashboard(@Request() req: any) {
    return this.administrationService.executiveDashboard(
      req.user?.userId,
    );
  }
}