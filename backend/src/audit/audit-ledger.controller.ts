import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditLedgerService } from './audit-ledger.service';

type AuthedRequest = { user?: { userId?: string } };

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('audit-ledger')
export class AuditLedgerController {
  constructor(private readonly ledger: AuditLedgerService) {}

  @Get()
  list(
    @Request() req: AuthedRequest,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('beforeId') beforeId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ledger.list({ entity, entityId, actorId, beforeId, limit: Number(limit) || undefined }, req.user);
  }

  @Get('verify')
  verify(@Request() req: AuthedRequest) {
    return this.ledger.verify(req.user);
  }
}
