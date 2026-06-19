import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { LaboratoryService } from './laboratory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('laboratory')
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'LAB_TECHNICIAN')
  findAll() {
    return this.laboratoryService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'LAB_TECHNICIAN')
  findOne(@Param('id') id: string) {
    return this.laboratoryService.findOne(id);
  }

  @Post(':id/results')
  @Roles('SUPER_ADMIN', 'LAB_TECHNICIAN')
  addResult(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.laboratoryService.addResult(id, body, req.user?.userId);
  }
}
