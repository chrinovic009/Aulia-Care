import { OffDutyService } from './off-duty.service';
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
  constructor(private readonly usersService: UsersService, private readonly offDuty: OffDutyService) {}

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
    'SURGEON',
    'ANESTHESIOLOGIST',
    'MIDWIFE',
    'PARAMEDIC',
    'DISPATCHER',
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

  @Post('pending-access-codes/:userId/reveal')
  @Roles('SUPER_ADMIN', 'ADMIN')
  revealAccessCode(@Param('userId') userId: string, @Request() req: any) {
    return this.usersService.revealAccessCode(userId, req.user?.userId);
  }

  @Get('pending-access-codes')
  @Roles('SUPER_ADMIN', 'ADMIN')
  pendingAccessCodes(@Request() req: any) {
    return this.usersService.pendingAccessCodes(req.user?.userId);
  }

  @Get('password-reset-requests')
  @Roles('SUPER_ADMIN', 'ADMIN')
  passwordResetRequests(@Request() req: any) {
    return this.usersService.passwordResetRequests(req.user?.userId);
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

  @Post('super-admin/admins')
  @Roles('SUPER_ADMIN')
  createAdmin(@Body() createUserDto: CreateUserDto, @Request() req: any) {
    return this.usersService.createAdmin(createUserDto, req.user?.userId);
  }

  @Post('password-reset-requests/:requestId/approve')
  @Roles('SUPER_ADMIN', 'ADMIN')
  approvePasswordReset(@Param('requestId') requestId: string, @Request() req: any) {
    return this.usersService.approvePasswordReset(requestId, req.user?.userId);
  }

  @Post('password-reset-requests/:requestId/reject')
  @Roles('SUPER_ADMIN', 'ADMIN')
  rejectPasswordReset(@Param('requestId') requestId: string, @Body() body: { note?: string }, @Request() req: any) {
    return this.usersService.rejectPasswordReset(requestId, body?.note, req.user?.userId);
  }

  @Post(':id/reset-password')
  @Roles('SUPER_ADMIN', 'ADMIN')
  resetPassword(@Param('id') id: string, @Request() req: any) {
    return this.usersService.resetPassword(id, req.user?.userId);
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
    return this.offDuty.clockIn(req.user?.userId);
  }

  /** Off duty after a validated departure: the session reads but cannot write. */
  @Get('me/work-mode')
  @UseGuards(JwtAuthGuard)
  workMode(@Request() req: { user?: { userId?: string } }) {
    return this.offDuty.workMode(req.user?.userId);
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
  async decideShiftHandover(@Request() req: any, @Body() dto: ShiftHandoverDecisionDto) {
    const result = await this.usersService.decideShiftHandover(req.user?.userId, dto);
    this.offDuty.forget(req.user?.userId);
    return result;
  }

  @Get('attendance/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  attendanceSummary(@Request() req: any) {
    return this.usersService.getAttendanceSummary(req.user?.userId, Number(req.query?.days));
  }
}
