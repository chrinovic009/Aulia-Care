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

const normalizePhone = (phone?: string) => phone?.replace(/[^0-9+]/g, '').trim();
const normalizeEmail = (email?: string) => email?.trim().toLowerCase();

const splitFullName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts.slice(-1).join(' ') : firstName;
  return { firstName, lastName };
};

// Admission fee fixed value used later

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsGateway: NotificationsGateway) {}

  async create(createPatientDto: CreatePatientDto) {
    const { service, receptionist, ...patientData } = createPatientDto;
    const createPayload: Prisma.PatientCreateInput = {
      ...patientData,
      ...(service
        ? {
            service: {
              connect: {
                id: service,
              },
            },
          }
        : {}),
      ...(receptionist
        ? {
            receptionist: {
              connect: {
                id: receptionist,
              },
            },
          }
        : {}),
    };

    const created = await this.prisma.patient.create({ data: createPayload });
    return created;
  }

  findAll() {
    // Always return comprehensive patient data for UI lists.
    // The frontend needs all fields for display in patient lists and details.
    return this.prisma.patient.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        email: true,
        gender: true,
        dateOfBirth: true,
        profession: true,
        address: true,
        city: true,
        postalCode: true,
        nationality: true,
        insuranceProvider: true,
        insuranceNumber: true,
        createdAt: true,
        updatedAt: true,
        workflowStatus: true,
        admissionType: true,
        priority: true,
        arrivalAt: true,
        serviceId: true,
        receptionistId: true,
        service: {
          select: {
            id: true,
            name: true,
          },
        },
        receptionist: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
        medicalHistories: {
          where: {
            kind: 'ADMISSION_METADATA',
          },
          select: {
            details: true,
          },
          orderBy: {
            eventDate: 'desc',
          },
          take: 1,
        },
        familyContacts: {
          select: {
            id: true,
            name: true,
            relationship: true,
            phone: true,
            email: true,
            address: true,
            createdAt: true,
          },
        },
      },
    });
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
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        medicalHistories: { orderBy: { eventDate: 'desc' } },
        familyContacts: true,
      },
    });
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

    // Resolve service only for orientation / assignment. Admission billing uses a distinct admission fee.
    let resolvedService: any = null;
    if (createAdmissionDto.serviceId) {
      resolvedService = await this.prisma.service.findUnique({ where: { id: createAdmissionDto.serviceId } });
    } else if (createAdmissionDto.service) {
      resolvedService = await this.prisma.service.findUnique({ where: { name: createAdmissionDto.service } });
    }

    // Use a fixed admission fee of $20 as requested
    const admissionFee = 20;

    console.log(createAdmissionDto);
    console.log("Receptionist ID:", createAdmissionDto.receptionistId);
    console.log("Receptionist Name:", createAdmissionDto.receptionist);
    const receptionistConnect = actorId
      ? { connect: { id: actorId } }
      : createAdmissionDto.receptionistId
        ? { connect: { id: createAdmissionDto.receptionistId } }
        : undefined;

    const admissionData: any = {
      firstName,
      lastName,
      middleName: createAdmissionDto.middleName,
      gender: createAdmissionDto.gender,
      dateOfBirth: new Date(createAdmissionDto.dateOfBirth),
      profession: createAdmissionDto.profession || undefined,
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
      priority: createAdmissionDto.priority,
      arrivalAt: createAdmissionDto.arrivalAt ? new Date(createAdmissionDto.arrivalAt) : new Date(),
      ...(resolvedService ? { service: { connect: { id: resolvedService.id } } } : {}),
      ...(receptionistConnect ? { receptionist: receptionistConnect } : {}),
    };

    const result = await this.prisma.$transaction(async (prisma) => {
      // If familyContacts were provided as an array, create them together with the patient
      if (
          createAdmissionDto.familyContacts &&
          Array.isArray(createAdmissionDto.familyContacts) &&
          createAdmissionDto.familyContacts.length > 0
        ) {
          admissionData.familyContacts = {
            create: createAdmissionDto.familyContacts.map((contact) => ({
              name: contact.name,
              relationship: contact.relation,
              phone: contact.phone,
              address: contact.address,
              email: contact.email,
            })),
          };
        }

      const patient = await prisma.patient.create({ data: admissionData });
      const invoice = await prisma.invoice.create({
        data: {
          patientId: patient.id,
          issuedById: actorId,
          status: 'PENDING',
          issuedAt: new Date(),
          totalAmount: admissionFee,
          balanceDue: admissionFee,
          dueDate: new Date(),
            type: 'ADMISSION_FEE',
          remarks: `Frais de fiche d'admission - ${resolvedService?.name || createAdmissionDto.service || ''}`,
        },
      });

      return { patient, invoice };
    });

    // compute age and persist admission metadata as a MedicalHistory entry
    const dob = createAdmissionDto.dateOfBirth ? new Date(createAdmissionDto.dateOfBirth) : null;
    const age = dob ? Math.floor((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) : null;

    // Resolve receptionist name from provided form value or user record
    let receptionistName: string | null = null;
    if (createAdmissionDto.receptionist) receptionistName = createAdmissionDto.receptionist;
    else if (createAdmissionDto.receptionistId) {
      const rec = await this.prisma.user.findUnique({ where: { id: createAdmissionDto.receptionistId } });
      receptionistName = rec ? rec.displayName || `${rec.firstName || ''} ${rec.lastName || ''}`.trim() : null;
    } else if (actorId) {
      const rec = await this.prisma.user.findUnique({ where: { id: actorId } });
      receptionistName = rec ? rec.displayName || `${rec.firstName || ''} ${rec.lastName || ''}`.trim() : null;
    }

    await this.prisma.medicalHistory.create({
      data: {
        patientId: result.patient.id,
        eventDate: new Date(),
        kind: 'ADMISSION_METADATA',
        details: JSON.stringify({
          dateOfBirth: createAdmissionDto.dateOfBirth || null,
          age,
          profession: createAdmissionDto.profession || null,
          familyContacts: createAdmissionDto.familyContacts || null,
          receptionistName,
        }),
        createdById: actorId || createAdmissionDto.receptionistId || null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        patientId: result.patient.id,
        action: AuditAction.CREATE,
        entity: 'Patient',
        entityId: result.patient.id,
        summary: 'Admission enregistrée et facture créée.',
        metadata: {
          admissionType: createAdmissionDto.admissionType,
          service: resolvedService?.name || createAdmissionDto.service || null,
          serviceId: resolvedService?.id || createAdmissionDto.serviceId || null,
          invoiceId: result.invoice.id,
        },
      },
    });

    const cashierUsers = await this.prisma.user.findMany({
      where: {
        OR: [
          { primaryRole: 'CASHIER' },
          { roles: { some: { role: { slug: 'CASHIER' } } } },
        ],
      },
    });

    const notifications = await Promise.all(
      cashierUsers.map((cashier) =>
        this.prisma.notification.create({
          data: {
            recipientId: cashier.id,
            type: 'ALERT',
            status: 'UNREAD',
            priority: 'HIGH',
            title: 'Nouveau paiement en attente',
            message: `Le patient ${result.patient.firstName} ${result.patient.lastName} attend le règlement des frais de fiche d'admission de ${admissionFee} FC.`,
            relatedEntity: 'Invoice',
            relatedId: result.invoice.id,
            sendAt: new Date(),
          },
        }),
      ),
    );

    notifications.forEach((notification) => {
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

    const { service, receptionist, ...patientData } = updatePatientDto;
    const updatePayload: Prisma.PatientUpdateInput = {
      ...patientData,
      ...(service
        ? {
            service: {
              connect: {
                id: service,
              },
            },
          }
        : {}),
      ...(receptionist
        ? {
            receptionist: {
              connect: {
                id: receptionist,
              },
            },
          }
        : {}),
    };

    const updated = await this.prisma.patient.update({ where: { id }, data: updatePayload });
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }
}
