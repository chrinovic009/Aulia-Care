import { Module } from '@nestjs/common';
import { ClinicContextService } from '../core/clinic-context.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicalSafetyController } from './clinical-safety.controller';
import { ClinicalSafetyService } from './clinical-safety.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalSafetyController],
  providers: [ClinicContextService, ClinicalSafetyService],
})
export class ClinicalSafetyModule {}
