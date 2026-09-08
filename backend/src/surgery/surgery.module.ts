import { Module } from '@nestjs/common';
import { SurgeryService } from './surgery.service';
import { SurgeryController } from './surgery.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicContextService } from '../core/clinic-context.service';

@Module({
  imports: [PrismaModule],
  controllers: [SurgeryController],
  providers: [SurgeryService, ClinicContextService],
})
export class SurgeryModule {}
