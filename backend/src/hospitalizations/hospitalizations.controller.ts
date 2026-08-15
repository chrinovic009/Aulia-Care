import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { HospitalizationsService } from './hospitalizations.service';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { CreateNursingCareTaskDto } from './dto/create-nursing-care-task.dto';
import { RecordMedicationAdministrationDto } from './dto/record-medication-administration.dto';
import { RecordNurseRoundDto } from './dto/record-nurse-round.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospitalizations')
export class HospitalizationsController {
  constructor(private readonly hospitalizationsService: HospitalizationsService) {}

  @Get('search')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  search(@Query('q') q: string, @Request() req: any) {
    return this.hospitalizationsService.search(q || '', req.user);
  }

  @Get('stats')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  stats(@Request() req: any) {
    return this.hospitalizationsService.getStats(req.user);
  }

  @Get('rooms')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  rooms(@Request() req: any) {
    return this.hospitalizationsService.getRoomInventory(req.user);
  }

  @Get('nurse/followed')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN')
  nurseFollowed(@Request() req: any) {
    return this.hospitalizationsService.getNurseHospitalizations(req.user?.userId);
  }

  @Get('nurse/available')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PHYSICIAN')
  availableNurses(@Query('serviceUnitId') serviceUnitId?: string) {
    return this.hospitalizationsService.getAvailableNurses(serviceUnitId);
  }

  @Get('nurse/rounds')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN')
  nurseRounds(@Request() req: any) {
    return this.hospitalizationsService.getNurseRounds(req.user?.userId);
  }

  @Post(':id/nurse-rounds')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE')
  recordNurseRound(@Param('id') id: string, @Body() body: RecordNurseRoundDto, @Request() req: any) {
    return this.hospitalizationsService.recordNurseRound(id, req.user?.userId, body);
  }

  @Post(':id/care-tasks')
  @Roles('PHYSICIAN')
  createCareTask(@Param('id') id: string, @Body() body: CreateNursingCareTaskDto, @Request() req: any) {
    return this.hospitalizationsService.createCareTask(id, body, req.user?.userId);
  }

  @Post(':id/medication-administrations')
  @Roles('NURSE')
  recordMedicationAdministration(@Param('id') id: string, @Body() body: RecordMedicationAdministrationDto, @Request() req: any) {
    return this.hospitalizationsService.recordMedicationAdministration(id, body, req.user?.userId);
  }

  @Get(':id/timeline')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  timeline(@Param('id') id: string, @Request() req: any) {
    return this.hospitalizationsService.getTimeline(id, req.user);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  findAll(@Request() req: any, @Query('limit') limit?: string) {
    return this.hospitalizationsService.findAll(req.user, Number(limit) || 100);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.hospitalizationsService.findOneForActor(id, req.user);
  }

  @Post()
  @Roles('PHYSICIAN')
  create(@Body() dto: CreateHospitalizationDto, @Request() req: any) {
    return this.hospitalizationsService.create(dto, req.user?.userId);
  }

  @Patch(':id')
  @Roles('PHYSICIAN')
  update(@Param('id') id: string, @Body() dto: UpdateHospitalizationDto, @Request() req: any) {
    return this.hospitalizationsService.update(id, dto, req.user?.userId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.hospitalizationsService.remove(id);
  }
}
