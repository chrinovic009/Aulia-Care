import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AuditAction, PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';

interface PatientSearchParams {
  email?: string;
  phone?: string;
  name?: string;
}

interface AdmissionSearchResult {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
}

const normalizePhone = (phone?: string) => phone?.replace(/[^0-9+]/g, '').trim();
const normalizeEmail = (email?: string) => email?.trim().toLowerCase();

const splitFullName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts.slice(-1).join(' ') : firstName;
  return { firstName, lastName };
};

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsGateway: NotificationsGateway) {}

  async create(createPatientDto: CreatePatientDto) {
    const created = await this.prisma.patient.create({ data: createPatientDto });
    return created;
  }

  findAll() {
    return this.prisma.patient.findMany();
  }

  async search(params: PatientSearchParams) {
    const conditions: Prisma.PatientWhereInput[] = [];

    if (params.email) {
      const email = normalizeEmail(params.email);
      conditions.push({ email });
    }

    if (params.phone) {
      const phone = normalizePhone(params.phone);
      if (phone) {
        conditions.push({ phone: { contains: phone } });
      }
    }

    if (params.name) {
      const name = params.name.trim();
      // Try a performant Postgres unaccent + ILIKE search via raw SQL when available
      try {
        const query = `SELECT id, "firstName", "lastName", "middleName", "phone", "email", "dateOfBirth" FROM "Patient" WHERE unaccent(lower(concat("firstName", ' ', "lastName"))) LIKE unaccent(lower($1)) LIMIT 10`;
        const pattern = `%${name.replace(/%/g, '\\%')}%`;
        const raw: any[] = await this.prisma.$queryRawUnsafe(query, pattern);
        if (raw && raw.length > 0) return raw;
      } catch (e) {
        // fallback to Prisma insensitive contains search
        const { firstName, lastName } = splitFullName(name);
        conditions.push({
          OR: [
            { firstName: { contains: firstName, mode: 'insensitive' } },
            { lastName: { contains: lastName, mode: 'insensitive' } },
            { OR: [{ firstName: { contains: name, mode: 'insensitive' } }, { lastName: { contains: name, mode: 'insensitive' } }] },
          ],
        });
      }
    }

    if (conditions.length === 0) {
      return this.findAll();
    }

    return this.prisma.patient.findMany({ where: { OR: conditions } });
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id } });
    if (!patient) {
      throw new NotFoundException('Patient introuvable');
    }
    return patient;
  }

  async createAdmission(createAdmissionDto: any, actorId?: string) {
    const email = normalizeEmail(createAdmissionDto.email);
    const phone = normalizePhone(createAdmissionDto.phone);
    const { firstName, lastName } = createAdmissionDto.fullName
      ? splitFullName(createAdmissionDto.fullName)
      : { firstName: createAdmissionDto.firstName || '', lastName: createAdmissionDto.lastName || '' };

    if (!firstName || !lastName) {
      throw new BadRequestException('Le prénom et le nom du patient doivent être fournis.');
    }

    const conflicts: Prisma.PatientWhereInput[] = [];
    if (email) {
      conflicts.push({ email });
    }
    if (phone) {
      conflicts.push({ phone });
    }
    if (firstName && lastName && createAdmissionDto.dateOfBirth) {
      conflicts.push({
        AND: [
          { firstName: { equals: firstName, mode: 'insensitive' } },
          { lastName: { equals: lastName, mode: 'insensitive' } },
          { dateOfBirth: new Date(createAdmissionDto.dateOfBirth) },
        ],
      });
    }

    if (conflicts.length > 0) {
      const existing = await this.prisma.patient.findFirst({ where: { OR: conflicts } });
      if (existing) {
        throw new ConflictException('Un patient existe déjà avec le même email, téléphone ou nom/date de naissance.');
      }
    }

    // Resolve service (by id or name) and active tarif to determine price
    let servicePrice = 0;
    let resolvedService: any = null;
    if (createAdmissionDto.serviceId) {
      resolvedService = await this.prisma.service.findUnique({ where: { id: createAdmissionDto.serviceId } });
    } else if (createAdmissionDto.service) {
      resolvedService = await this.prisma.service.findUnique({ where: { name: createAdmissionDto.service } });
    }
    if (resolvedService) {
      const tarif = await this.prisma.serviceTarif.findFirst({
        where: { serviceId: resolvedService.id, actif: true },
        orderBy: { dateDebut: 'desc' },
      });
      if (tarif) servicePrice = Number(tarif.prix);
    }

    const admissionData = {
      firstName,
      lastName,
      middleName: createAdmissionDto.middleName,
      gender: createAdmissionDto.gender,
      dateOfBirth: new Date(createAdmissionDto.dateOfBirth),
      email,
      phone,
      address: createAdmissionDto.address,
      city: createAdmissionDto.city,
      postalCode: createAdmissionDto.postalCode,
      nationality: createAdmissionDto.nationality,
      insuranceProvider: createAdmissionDto.insuranceProvider,
      insuranceNumber: createAdmissionDto.insuranceNumber,
      workflowStatus: PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
      admissionType: createAdmissionDto.admissionType,
      serviceId: resolvedService ? resolvedService.id : createAdmissionDto.serviceId ?? null,
      priority: createAdmissionDto.priority,
      arrivalAt: createAdmissionDto.arrivalAt ? new Date(createAdmissionDto.arrivalAt) : new Date(),
      receptionist: createAdmissionDto.receptionist,
    };

    const result = await this.prisma.$transaction(async (prisma) => {
      const patient = await prisma.patient.create({ data: admissionData });
      const invoice = await prisma.invoice.create({
        data: {
          patientId: patient.id,
          issuedById: actorId,
          status: 'PENDING',
          issuedAt: new Date(),
          totalAmount: servicePrice,
          balanceDue: servicePrice,
          dueDate: new Date(),
          remarks: `Admission ${createAdmissionDto.admissionType} - ${resolvedService?.name || createAdmissionDto.service || ''}`,
        },
      });

      const audit = await prisma.auditLog.create({
        data: {
          actorId,
          patientId: patient.id,
          action: AuditAction.CREATE,
          entity: 'Patient',
          entityId: patient.id,
          summary: 'Admission enregistrée et facture créée.',
          metadata: {
            admissionType: createAdmissionDto.admissionType,
            service: resolvedService?.name || createAdmissionDto.service || null,
            serviceId: resolvedService?.id || createAdmissionDto.serviceId || null,
            invoiceId: invoice.id,
          },
        },
      });

      const cashierUsers = await prisma.user.findMany({
        where: {
          OR: [
            { primaryRole: 'CASHIER' },
            { roles: { some: { role: { slug: 'CASHIER' } } } },
          ],
        },
      });

      const notifications = await Promise.all(
        cashierUsers.map((cashier) =>
          prisma.notification.create({
            data: {
              recipientId: cashier.id,
              type: 'ALERT',
              status: 'UNREAD',
              priority: 'HIGH',
              title: 'Nouveau paiement en attente',
              message: `Le patient ${patient.firstName} ${patient.lastName} attend le règlement de ${servicePrice} FC.`,
              relatedEntity: 'Invoice',
              relatedId: invoice.id,
              sendAt: new Date(),
            },
          }),
        ),
      );

      return { patient, invoice, notifications, audit };
    });

    result.notifications.forEach((notification) => {
      this.notificationsGateway.notify('notification.created', notification);
    });

    return {
      patient: result.patient,
      invoice: result.invoice,
      message: 'Admission enregistrée et facture créée. Le caissier a été notifié.',
    };
  }

  async update(id: string, updatePatientDto: UpdatePatientDto) {
    await this.findOne(id);
    const updated = await this.prisma.patient.update({ where: { id }, data: updatePatientDto });
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }
}
