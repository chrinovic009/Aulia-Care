import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PacsConfigService } from './pacs-config.service';
@Module({ imports: [PrismaModule], providers: [PacsConfigService], exports: [PacsConfigService] })
export class PacsModule {}