import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { SurgeryService } from './surgery.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('surgery')
export class SurgeryController {
  constructor(private readonly surgeryService: SurgeryService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN')
  findAll() {
    return this.surgeryService.findAll();
  }

  @Get('operating-rooms/all')
  @Roles('SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN')
  operatingRooms() {
    return this.surgeryService.operatingRooms();
  }

  @Post()
  @Roles('SUPER_ADMIN', 'PHYSICIAN')
  create(@Body() body: any, @Request() req: any) {
    return this.surgeryService.create(body, req.user?.userId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN')
  findOne(@Param('id') id: string) {
    return this.surgeryService.findOne(id);
  }
}
