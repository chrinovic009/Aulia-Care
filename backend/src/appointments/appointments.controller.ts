import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { CreateOwnAppointmentDto } from './dto/create-own-appointment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedActor } from '../core/clinic-context.service';

interface AuthenticatedRequest {
  user?: AuthenticatedActor;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  findAll(@Request() req: AuthenticatedRequest) {
    return this.appointmentsService.findAll(req.user?.userId || req.user?.id);
  }

  @Get('booking-options')
  @Roles('PATIENT')
  bookingOptions(@Request() req: AuthenticatedRequest) {
    return this.appointmentsService.getBookingOptions(req.user?.userId);
  }

  @Post('me')
  @Roles('PATIENT')
  createOwn(@Body() dto: CreateOwnAppointmentDto, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.createOwn(dto, req.user?.userId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.findOne(id, req.user?.userId || req.user?.id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  create(@Body() createAppointmentDto: CreateAppointmentDto, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.create(createAppointmentDto, req.user?.userId || req.user?.id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN')
  update(@Param('id') id: string, @Body() updateAppointmentDto: UpdateAppointmentDto, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.update(id, updateAppointmentDto, req.user);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.appointmentsService.remove(id, req.user?.userId || req.user?.id);
  }
}
