import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
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

const clinicalAiModules = process.env.AULIA_ENABLE_CLINICAL_AI === 'false'
  ? []
  : [ClinicalIntelligenceModule, IntelligenceModule];
const connectedCareModules = process.env.AULIA_ENABLE_CONNECTED_CARE === 'false'
  ? []
  : [WearablesModule];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120, blockDuration: 60_000 }],
    }),
    PrismaModule,
    PlatformLayersModule,
    PlatformProvisioningModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PatientsModule,
    AppointmentsModule,
    ConsultationsModule,
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
    ...clinicalAiModules,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PlatformLayerAccessGuard },
  ],
})
export class AppModule {}
