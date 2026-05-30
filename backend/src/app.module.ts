import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
    NotificationsModule,
    AuditModule,
  ],
})
export class AppModule {}
