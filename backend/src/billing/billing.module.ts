import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { UnitExamReconciliationController } from './unit-exam-reconciliation.controller';
import { UnitExamReconciliationService } from './unit-exam-reconciliation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [BillingController, PaymentsController, UnitExamReconciliationController],
  providers: [BillingService, PaymentsService, UnitExamReconciliationService],
})
export class BillingModule {}
