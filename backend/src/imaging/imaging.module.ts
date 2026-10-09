import { Module } from '@nestjs/common';
import { ImagingService } from './imaging.service';
import { ImagingController } from './imaging.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicContextService } from '../core/clinic-context.service';

@Module({
  imports: [PrismaModule],
  controllers: [ImagingController],
  providers: [ImagingService, ClinicContextService],
})
export class ImagingModule {}
