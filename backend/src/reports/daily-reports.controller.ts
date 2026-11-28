import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DailyReportsService } from './daily-reports.service';

class RegenerateDto { @IsString() @MaxLength(10) day: string; }
type Authed = { user?: { userId?: string } };

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('reports/daily')
export class DailyReportsController {
  constructor(private readonly reports: DailyReportsService) {}

  @Get(':service')
  list(@Param('service') service: string, @Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined, @Request() req: Authed) {
    return this.reports.list(service, Number(page) || 1, Number(pageSize) || 7, req.user);
  }

  @Get(':service/period')
  period(@Param('service') service: string, @Query('from') from: string, @Query('to') to: string, @Request() req: Authed) {
    return this.reports.period(service, from, to, req.user);
  }

  @Post('regenerate')
  @Roles('ADMIN')
  regenerate(@Body() body: RegenerateDto, @Request() req: Authed) {
    return this.reports.regenerate(body.day, req.user);
  }
}
