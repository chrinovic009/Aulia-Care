import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CareUnitsService } from './care-units.service';
import { CreateCareUnitDto, UpdateCareUnitDto, UpsertCareUnitAssignmentDto } from './dto/care-workflow.dto';

type AuthedRequest = { user?: { userId?: string; id?: string; role?: string | null } };

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('care-units')
export class CareUnitsController {
  constructor(private readonly units: CareUnitsService) {}

  @Get()
  list(@Request() req: AuthedRequest) {
    return this.units.list(req.user);
  }

  @Post()
  create(@Body() dto: CreateCareUnitDto, @Request() req: AuthedRequest) {
    return this.units.create(dto, req.user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCareUnitDto, @Request() req: AuthedRequest) {
    return this.units.update(id, dto, req.user);
  }

  @Get(':id/assignments')
  assignments(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    return this.units.assignments(id, req.user);
  }

  @Put(':id/assignments')
  upsertAssignment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertCareUnitAssignmentDto, @Request() req: AuthedRequest) {
    return this.units.upsertAssignment(id, dto, req.user);
  }
}
