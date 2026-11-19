import {Module} from '@nestjs/common';
import {PrismaModule} from '../prisma/prisma.module';
import {ConsultationsModule} from '../consultations/consultations.module';
import {GovernanceController} from './governance.controller';
import {GovernanceService} from './governance.service';
@Module({imports:[PrismaModule,ConsultationsModule],providers:[GovernanceService],controllers:[GovernanceController]})
export class GovernanceModule {}
