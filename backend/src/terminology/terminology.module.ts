import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TerminologyController } from './terminology.controller';
import { TerminologyService } from './terminology.service';

/** Standard terminologies: ICD-10 (CIM-10) and LOINC. */
@Module({
  imports: [PrismaModule],
  controllers: [TerminologyController],
  providers: [TerminologyService],
  exports: [TerminologyService],
})
export class TerminologyModule {}
