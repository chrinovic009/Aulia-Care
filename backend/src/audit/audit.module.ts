import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicContextService } from '../core/clinic-context.service';
import { AuditLedgerController } from './audit-ledger.controller';
import { AuditLedgerService } from './audit-ledger.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditController, AuditLedgerController],
  providers: [AuditService, AuditLedgerService, ClinicContextService],
  exports: [AuditLedgerService],
})
export class AuditModule {}
