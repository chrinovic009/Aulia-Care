import { Module } from '@nestjs/common';
import { ImagingService } from './imaging.service';
import { ImagingController } from './imaging.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ImagingController],
  providers: [ImagingService],
})
export class ImagingModule {}
