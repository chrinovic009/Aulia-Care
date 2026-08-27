import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ShiftHandoverDecisionDto } from './dto/shift-handover-decision.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  findAll(@Request() req: any) {
    return this.usersService.findAll(req.user?.userId);
  }

  @Get('contacts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'NURSE',
    'PHYSICIAN',
    'LAB_MANAGER',
    'LAB_TECHNICIAN',
    'RADIOLOGIST',
    'PHARMACIST',
    'CASHIER',
    'FINANCE',
    'PATIENT',
  )
  findContacts(@Request() req: any) {
    return this.usersService.findContactsForRole(req.user?.role, req.user?.userId);
  }

  @Get('physicians/available')
  @Roles('NURSE', 'PHYSICIAN', 'RECEPTIONIST', 'ADMIN', 'SUPER_ADMIN')
  findAvailablePhysicians(@Request() req: any) {
    return this.usersService.findAvailablePhysicians(req.user?.userId);
  }

  @Get('me/work-location')
  @UseGuards(JwtAuthGuard)
  workLocation(@Request() req: any) {
    return this.usersService.findMyWorkLocation(req.user?.userId);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.usersService.findOne(id, req.user?.userId);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() createUserDto: CreateUserDto, @Request() req: any) {
    return this.usersService.create(createUserDto, req.user?.userId);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @Request() req: any) {
    return this.usersService.update(id, updateUserDto, req.user?.userId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.usersService.remove(id, req.user?.userId);
  }

  @Post('me/clock-in')
  @UseGuards(JwtAuthGuard)
  clockIn(@Request() req: any) {
    return this.usersService.clockIn(req.user?.userId);
  }

  @Post('me/clock-out')
  @UseGuards(JwtAuthGuard)
  clockOut(@Request() req: any) {
    return this.usersService.clockOut(req.user?.userId);
  }

  @Get('me/shift-handover')
  @UseGuards(JwtAuthGuard)
  shiftHandover(@Request() req: any) {
    return this.usersService.getShiftHandover(req.user?.userId);
  }

  @Post('me/shift-handover/decision')
  @UseGuards(JwtAuthGuard)
  decideShiftHandover(@Request() req: any, @Body() dto: ShiftHandoverDecisionDto) {
    return this.usersService.decideShiftHandover(req.user?.userId, dto);
  }

  @Get('attendance/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  attendanceSummary(@Request() req: any) {
    return this.usersService.getAttendanceSummary(req.user?.userId, Number(req.query?.days));
  }
}
