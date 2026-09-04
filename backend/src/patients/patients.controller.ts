import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import { PatientsService } from './patients.service';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { RecordVitalSignsDto } from './dto/record-vital-signs.dto';
import { CreateDailyCheckinDto } from './dto/create-daily-checkin.dto';
import { AuthenticatedActor } from '../core/clinic-context.service';

type PatientRequest = {
  user?: AuthenticatedActor;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findAll(
    @Request() req: PatientRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.patientsService.findAll(
      req.user,
      Number(page),
      Number(limit),
    );
  }

  @Get('search')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  search(
    @Query('email') email?: string,
    @Query('phone') phone?: string,
    @Query('name') name?: string,
    @Request() req?: PatientRequest,
  ) {
    return this.patientsService.search(
      { email, phone, name },
      req?.user,
    );
  }

  @Get('cashier/awaiting-payment')
  @Roles('ADMIN', 'CASHIER')
  getPatientsAwaitingPayment(@Request() req: PatientRequest) {
    return this.patientsService.getPatientsAwaitingPayment(req.user);
  }

  @Get('nurse/awaiting-vitals')
  @Roles('ADMIN', 'NURSE')
  getPatientsAwaitingNurseVitals(@Request() req: PatientRequest) {
    return this.patientsService.getPatientsAwaitingNurseVitals(req.user);
  }

  @Get('nurse/orientation-history')
  @Roles('ADMIN', 'NURSE')
  getNurseOrientationHistory(
    @Query('period') period: 'today' | 'yesterday' | 'week' | 'all' = 'today',
    @Request() req: PatientRequest,
  ) {
    return this.patientsService.getNurseOrientationHistory(
      period,
      req.user,
    );
  }

  @Get('doctor/assigned')
  @Roles('PHYSICIAN')
  getPatientsAssignedToDoctor(@Request() req: PatientRequest) {
    return this.patientsService.getPatientsAssignedToDoctor(
      req.user?.userId,
    );
  }

  @Get('doctor/visible')
  @Roles('PHYSICIAN')
  getPatientsVisibleToDoctors(
    @Request() req: PatientRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.patientsService.getPatientsVisibleToDoctors(
      req.user?.userId,
      Number(page),
      Number(limit),
    );
  }

  @Get('reception-visits')
  @Roles('ADMIN', 'RECEPTIONIST')
  getReceptionVisits(
    @Query('limit') limit: string | undefined,
    @Request() req: PatientRequest,
  ) {
    return this.patientsService.getReceptionVisits(
      req.user?.userId,
      Number(limit) || 100,
    );
  }

  @Get('me/profile')
  @Roles('PATIENT')
  getMyPatientProfile(@Request() req: PatientRequest) {
    return this.patientsService.getPatientProfileForUser(
      req.user?.userId,
    );
  }

  @Post('me/daily-checkins')
  @Roles('PATIENT')
  createDailyCheckin(
    @Body() dto: CreateDailyCheckinDto,
    @Request() req: PatientRequest,
  ) {
    return this.patientsService.createDailyCheckin(
      req.user?.userId,
      dto,
    );
  }

  @Post(':id/vital-signs')
  @Roles('ADMIN', 'NURSE')
  recordVitalSigns(
    @Param('id') id: string,
    @Body() dto: RecordVitalSignsDto,
    @Request() req: PatientRequest,
  ) {
    return this.patientsService.recordVitalSigns(
      id,
      dto,
      req.user?.userId,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findOne(
    @Param('id') id: string,
    @Request() req: PatientRequest,
  ) {
    if (
      req.user?.primaryRole === 'PHYSICIAN' ||
      req.user?.role === 'PHYSICIAN'
    ) {
      return this.patientsService.findOneForDoctor(
        id,
        req.user.userId,
      );
    }

    return this.patientsService.findOneForActor(
      id,
      req.user?.userId,
    );
  }

  @Post('admissions')
  @Roles('ADMIN', 'RECEPTIONIST')
  createAdmission(
    @Body() createAdmissionDto: CreateAdmissionDto,
    @Request() req: PatientRequest,
  ) {
    return this.patientsService.createAdmission(
      createAdmissionDto,
      req.user?.userId,
    );
  }

  @Patch(':id')
  @Roles('ADMIN', 'RECEPTIONIST')
  update(
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @Request() req: PatientRequest,
  ) {
    return this.patientsService.update(
      id,
      updatePatientDto,
      req.user,
    );
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(
    @Param('id') id: string,
    @Request() req: PatientRequest,
  ) {
    return this.patientsService.remove(
      id,
      req.user,
    );
  }
}
