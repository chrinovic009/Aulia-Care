import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PatientWorkflowService } from './patient-workflow.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PatientWorkflowService],
  exports: [PatientWorkflowService],
})
export class CoreModule {}
