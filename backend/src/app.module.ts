// Optional module membership is decided while this file is evaluated, before
// ConfigModule.forRoot() runs. Load the same local environment first.
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextInterceptor } from './core/request-context.interceptor';
import { AuditReadInterceptor } from './audit/audit-read.interceptor';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyRetentionService } from './idempotency/idempotency-retention.service';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.validation';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CareWorkflowModule } from './care-workflow/care-workflow.module';
import { TerminologyModule } from './terminology/terminology.module';
import { HrModule } from './hr/hr.module';
import { ClinicalSafetyModule } from './clinical-safety/clinical-safety.module';
import { ReferenceModule } from './reference/reference.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { HospitalizationsModule } from './hospitalizations/hospitalizations.module';
import { LaboratoryModule } from './laboratory/laboratory.module';
import { ImagingModule } from './imaging/imaging.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { SurgeryModule } from './surgery/surgery.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { ServicesModule } from './services/services.module';
import { MessagesModule } from './messages/messages.module';
import { AdministrationModule } from './administration/administration.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { WearablesModule } from './wearables/wearables.module';
import { ClinicalIntelligenceModule } from './clinical-intelligence/clinical-intelligence.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { PlatformLayersModule } from './platform/layers/platform-layers.module';
import { PlatformLayerAccessGuard } from './platform/layers/platform-layer-access.guard';
import { PlatformProvisioningModule } from './platform/provisioning/platform-provisioning.module';
import { HealthModule } from './health/health.module';
import { GovernanceModule } from './medical-governance/governance.module';
import { CoreModule } from './core/core.module';

const diagnosticAgentModules = process.env.AULIA_ENABLE_DIAGNOSTIC_AGENT === 'false'
  ? []
  : [ClinicalIntelligenceModule, IntelligenceModule];
const connectedCareModules = process.env.AULIA_ENABLE_CONNECTED_CARE === 'false'
  ? []
  : [WearablesModule];

@Module({
  imports: [
    CareWorkflowModule,
    TerminologyModule,
    HrModule,
    ClinicalSafetyModule,
    ReferenceModule,
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment('core') }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120, blockDuration: 60_000 }],
    }),
    PrismaModule,
    CoreModule,
    PlatformLayersModule,
    PlatformProvisioningModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PatientsModule,
    AppointmentsModule,
    ConsultationsModule,
    GovernanceModule,
    HealthModule,
    HospitalizationsModule,
    LaboratoryModule,
    ImagingModule,
    PharmacyModule,
    SurgeryModule,
    BillingModule,
    ServicesModule,
    AdministrationModule,
    SubscriptionsModule,
    MessagesModule,
    NotificationsModule,
    AuditModule,
    ...connectedCareModules,
    ...diagnosticAgentModules,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PlatformLayerAccessGuard },
    // Order matters: the request context must wrap the read audit.
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditReadInterceptor },
    // Inside the request context, so replays and stored results are attributed and isolated.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    IdempotencyRetentionService,
  ],
})
export class AppModule {}
