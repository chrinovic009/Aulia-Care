import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { HospitalizationsService } from './hospitalizations.service';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { CreateNursingCareTaskDto } from './dto/create-nursing-care-task.dto';
import { UpdateNursingCareTaskDto } from './dto/update-nursing-care-task.dto';
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
  @Roles('ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  search(@Query('q') q: string, @Request() req: any) {
    return this.hospitalizationsService.search(q || '', req.user);
  }

  @Get('stats')
  @Roles('ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  stats(@Request() req: any) {
    return this.hospitalizationsService.getStats(req.user);
  }

  @Get('rooms')
  @Roles('ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  rooms(@Request() req: any) {
    return this.hospitalizationsService.getRoomInventory(req.user);
  }

  @Get('nurse/followed')
  @Roles('ADMIN', 'NURSE', 'PHYSICIAN')
  nurseFollowed(@Request() req: any) {
    return this.hospitalizationsService.getNurseHospitalizations(req.user);
  }

  @Get('nurse/available')
  @Roles('ADMIN', 'PHYSICIAN')
  availableNurses(@Query('serviceUnitId') serviceUnitId: string | undefined, @Request() req: any) {
    return this.hospitalizationsService.getAvailableNurses(serviceUnitId, req.user);
  }

  @Get('nurse/rounds')
  @Roles('ADMIN', 'NURSE', 'PHYSICIAN')
  nurseRounds(@Request() req: any) {
    return this.hospitalizationsService.getNurseRounds(req.user);
  }

  @Patch('nurse/care-tasks/:taskId')
  @Roles('NURSE')
  updateNurseCareTask(@Param('taskId') taskId: string, @Body() body: UpdateNursingCareTaskDto, @Request() req: any) {
    return this.hospitalizationsService.updateNurseCareTask(taskId, body, req.user?.userId);
  }

  @Post(':id/nurse-rounds')
  @Roles('ADMIN', 'NURSE')
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
  @Roles('ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  timeline(@Param('id') id: string, @Request() req: any) {
    return this.hospitalizationsService.getTimeline(id, req.user);
  }

  @Get()
  @Roles('ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
  findAll(@Request() req: any, @Query('limit') limit?: string) {
    return this.hospitalizationsService.findAll(req.user, Number(limit) || 100);
  }

  @Get(':id')
  @Roles('ADMIN', 'RECEPTIONIST', 'PHYSICIAN')
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
  @Roles('ADMIN')
  remove(@Param('id') id: string, @Request() req: { user?: { userId?: string } }) {
    return this.hospitalizationsService.remove(id, req.user?.userId);
  }
}
