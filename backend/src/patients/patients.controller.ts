import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { RecordVitalSignsDto } from './dto/record-vital-signs.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findAll() {
    return this.patientsService.findAll();
  }

  @Get('search')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  search(@Query('email') email?: string, @Query('phone') phone?: string, @Query('name') name?: string) {
    return this.patientsService.search({ email, phone, name });
  }

  @Get('cashier/awaiting-payment')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CASHIER')
  getPatientsAwaitingPayment() {
    return this.patientsService.getPatientsAwaitingPayment();
  }

  @Get('nurse/awaiting-vitals')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE')
  getPatientsAwaitingNurseVitals() {
    return this.patientsService.getPatientsAwaitingNurseVitals();
  }

  @Get('doctor/assigned')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN')
  getPatientsAssignedToDoctor(@Request() req: any) {
    return this.patientsService.getPatientsAssignedToDoctor(req.user?.userId);
  }

  @Get('doctor/visible')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN')
  getPatientsVisibleToDoctors(@Request() req: any) {
    return this.patientsService.getPatientsVisibleToDoctors(req.user?.userId);
  }

  @Get('me/profile')
  @Roles('PATIENT')
  getMyPatientProfile(@Request() req: any) {
    return this.patientsService.getPatientProfileForUser(req.user?.userId);
  }

  @Post(':id/vital-signs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE')
  recordVitalSigns(@Param('id') id: string, @Body() dto: RecordVitalSignsDto, @Request() req: any) {
    return this.patientsService.recordVitalSigns(id, dto, req.user?.userId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Post('admissions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createAdmission(@Body() createAdmissionDto: CreateAdmissionDto, @Request() req: any) {
    return this.patientsService.createAdmission(createAdmissionDto, req.user?.userId);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  create(@Body() createPatientDto: CreatePatientDto) {
    return this.patientsService.create(createPatientDto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  update(@Param('id') id: string, @Body() updatePatientDto: UpdatePatientDto) {
    return this.patientsService.update(id, updatePatientDto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.patientsService.remove(id);
  }
}
