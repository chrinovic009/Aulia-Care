import { Module } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { PharmacyController } from './pharmacy.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicContextService } from '../core/clinic-context.service';

@Module({
  imports: [PrismaModule],
  controllers: [PharmacyController],
  providers: [PharmacyService, ClinicContextService],
})
export class PharmacyModule {}
