import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClinicContextService } from './clinic-context.service';
import { PatientWorkflowService } from './patient-workflow.service';

/**
 * Global Core module: one shared instance of each tenant/workflow service.
 * Feature modules inject these without re-declaring them as providers.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [ClinicContextService, PatientWorkflowService],
  exports: [ClinicContextService, PatientWorkflowService],
})
export class CoreModule {}
