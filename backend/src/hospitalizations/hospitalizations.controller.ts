import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { HospitalizationsService } from './hospitalizations.service';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospitalizations')
export class HospitalizationsController {
  constructor(private readonly hospitalizationsService: HospitalizationsService) {}

  @Get('search')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  search(@Query('q') q: string) {
    return this.hospitalizationsService.search(q || '');
  }

  @Get('stats')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  stats() {
    return this.hospitalizationsService.getStats();
  }

  @Get('rooms')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  rooms() {
    return this.hospitalizationsService.getRoomInventory();
  }

  @Get('nurse/followed')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN')
  nurseFollowed(@Request() req: any) {
    return this.hospitalizationsService.getNurseHospitalizations(req.user?.userId);
  }

  @Get('nurse/rounds')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN')
  nurseRounds(@Request() req: any) {
    return this.hospitalizationsService.getNurseRounds(req.user?.userId);
  }

  @Post(':id/nurse-rounds')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE')
  recordNurseRound(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.hospitalizationsService.recordNurseRound(id, req.user?.userId, body);
  }

  @Get(':id/timeline')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  timeline(@Param('id') id: string) {
    return this.hospitalizationsService.getTimeline(id);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findAll() {
    return this.hospitalizationsService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER')
  findOne(@Param('id') id: string) {
    return this.hospitalizationsService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN')
  create(@Body() dto: CreateHospitalizationDto) {
    return this.hospitalizationsService.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN')
  update(@Param('id') id: string, @Body() dto: UpdateHospitalizationDto) {
    return this.hospitalizationsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string) {
    return this.hospitalizationsService.remove(id);
  }
}
