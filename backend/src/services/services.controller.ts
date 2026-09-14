import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

interface AuthenticatedRequest {
  user?: { userId?: string; id?: string };
}

const actorIdFrom = (request: AuthenticatedRequest) => request.user?.userId || request.user?.id;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'FINANCE', 'LAB_MANAGER', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'PATIENT')
  findAll(@Request() request: AuthenticatedRequest) {
    return this.servicesService.findAll(actorIdFrom(request));
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER', 'FINANCE', 'LAB_MANAGER', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'PATIENT')
  findOne(@Param('id') id: string, @Request() request: AuthenticatedRequest) {
    return this.servicesService.findOne(id, actorIdFrom(request));
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() body: CreateServiceDto & { departmentId?: string }, @Request() request: AuthenticatedRequest) {
    return this.servicesService.create(body, actorIdFrom(request));
  }

  @Post('reception-administrative')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createReceptionAdministrativeUnit(@Body() body: { name?: string; description?: string }, @Request() request: AuthenticatedRequest) {
    return this.servicesService.createReceptionAdministrativeUnit(body, actorIdFrom(request));
  }

  @Post('reception-admission-fees')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  setReceptionAdmissionFee(@Body() body: { kind?: string; price?: number | string; description?: string }, @Request() request: AuthenticatedRequest) {
    return this.servicesService.setReceptionAdmissionFee(body, actorIdFrom(request));
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateServiceDto, @Request() request: AuthenticatedRequest) {
    return this.servicesService.update(id, body, actorIdFrom(request));
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @Request() request: AuthenticatedRequest) {
    return this.servicesService.remove(id, actorIdFrom(request));
  }

  @Post(':id/prices')
  @Roles('SUPER_ADMIN', 'ADMIN')
  addPrice(@Param('id') id: string, @Body() body: { prix: number | string; dateDebut?: string }, @Request() request: AuthenticatedRequest) {
    return this.servicesService.addTarif({ ...body, serviceId: id }, actorIdFrom(request));
  }

  @Post(':id/responsables')
  @Roles('SUPER_ADMIN', 'ADMIN')
  addResponsables(@Param('id') id: string, @Body() body: { userId: string; principal?: boolean } | Array<{ userId: string; principal?: boolean }>, @Request() request: AuthenticatedRequest) {
    const items = Array.isArray(body) ? body : [body];
    return this.servicesService.addResponsables(items.map((it) => ({ ...it, serviceId: id })), actorIdFrom(request));
  }
  @Post(':id/staff')
  @Roles('SUPER_ADMIN', 'ADMIN')
  addStaff(
    @Param('id') id: string,
    @Body() body: { userId: string; roleInService?: string } | Array<{ userId: string; roleInService?: string }>,
    @Request() request: AuthenticatedRequest,
  ) {
    const items = Array.isArray(body)
      ? body
      : [body];

    return this.servicesService.addStaff(
      items.map((it) => ({
        ...it,
        serviceId: id,
      })),
      actorIdFrom(request),
    );
  }
}
