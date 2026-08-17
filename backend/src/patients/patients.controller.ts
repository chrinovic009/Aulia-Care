import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { RecordVitalSignsDto } from './dto/record-vital-signs.dto';
import { CreateDailyCheckinDto } from './dto/create-daily-checkin.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findAll(@Request() req: any) {
    return this.patientsService.findAll(req.user);
  }

  @Get('search')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  search(@Query('email') email?: string, @Query('phone') phone?: string, @Query('name') name?: string, @Request() req?: any) {
    return this.patientsService.search({ email, phone, name }, req?.user);
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

  @Get('nurse/orientation-history')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE')
  getNurseOrientationHistory(@Query('period') period: 'today' | 'yesterday' | 'week' | 'all' = 'today') {
    return this.patientsService.getNurseOrientationHistory(period);
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

  @Get('reception-visits')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  getReceptionVisits(@Query('limit') limit: string | undefined, @Request() req: any) {
    return this.patientsService.getReceptionVisits(req.user?.userId, Number(limit) || 100);
  }

  @Get('me/profile')
  @Roles('PATIENT')
  getMyPatientProfile(@Request() req: any) {
    return this.patientsService.getPatientProfileForUser(req.user?.userId);
  }

  @Post('me/daily-checkins')
  @Roles('PATIENT')
  createDailyCheckin(@Body() dto: CreateDailyCheckinDto, @Request() req: any) {
    return this.patientsService.createDailyCheckin(req.user?.userId, dto);
  }

  @Post(':id/vital-signs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE')
  recordVitalSigns(@Param('id') id: string, @Body() dto: RecordVitalSignsDto, @Request() req: any) {
    return this.patientsService.recordVitalSigns(id, dto, req.user?.userId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findOne(@Param('id') id: string, @Request() req: any) {
    if (req.user?.primaryRole === 'PHYSICIAN' || req.user?.role === 'PHYSICIAN') {
      return this.patientsService.findOneForDoctor(id, req.user.userId);
    }
    return this.patientsService.findOne(id);
  }

  @Post('admissions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  createAdmission(@Body() createAdmissionDto: CreateAdmissionDto, @Request() req: any) {
    return this.patientsService.createAdmission(createAdmissionDto, req.user?.userId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST')
  update(@Param('id') id: string, @Body() updatePatientDto: UpdatePatientDto, @Request() req: any) {
    return this.patientsService.update(id, updatePatientDto, req.user);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.patientsService.remove(id);
  }
}
