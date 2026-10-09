import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicContextService } from '../core/clinic-context.service';

@Module({
  imports: [PrismaModule],
  providers: [ServicesService, ClinicContextService],
  controllers: [ServicesController],
  exports: [ServicesService],
})
export class ServicesModule {}
