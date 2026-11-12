import { Module } from '@nestjs/common';
import { ClinicContextService } from '../core/clinic-context.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CareAccessService } from './care-access.service';
import { CareUnitsController } from './care-units.controller';
import { CareUnitsService } from './care-units.service';
import { CareWorkflowController } from './care-workflow.controller';
import { CareWorkflowService } from './care-workflow.service';

/** Care Workflow Engine: shared requests, tasks, stays, events and hand-offs of every unit. */
@Module({
  imports: [PrismaModule],
  controllers: [CareUnitsController, CareWorkflowController],
  providers: [ClinicContextService, CareAccessService, CareWorkflowService, CareUnitsService],
  exports: [CareAccessService, CareWorkflowService],
})
export class CareWorkflowModule {}
