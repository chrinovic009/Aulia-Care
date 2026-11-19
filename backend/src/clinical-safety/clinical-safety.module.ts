import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicalSafetyController } from './clinical-safety.controller';
import { ClinicalSafetyService } from './clinical-safety.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicalSafetyController],
  providers: [ClinicalSafetyService],
})
export class ClinicalSafetyModule {}
