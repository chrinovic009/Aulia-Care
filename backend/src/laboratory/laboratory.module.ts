import { Module } from '@nestjs/common';
import { LaboratoryService } from './laboratory.service';
import { LaboratoryController } from './laboratory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClinicContextService } from '../core/clinic-context.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [LaboratoryController],
  providers: [LaboratoryService, ClinicContextService],
})
export class LaboratoryModule {}
