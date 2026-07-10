import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AuditAction, PatientWorkflowStatus, VitalType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { RecordVitalSignsDto } from './dto/record-vital-signs.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import * as bcrypt from 'bcrypt';

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
        service: {
          select: {
            id: true,
            name: true,
          },
        },
        receptionistId: true,
        receptionist: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            username: true,
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

  async getPatientProfileForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, firstName: true, lastName: true },
    });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const patient = await this.prisma.patient.findFirst({
      where: {
        deletedAt: null,
        OR: [
          user.email ? { email: user.email } : undefined,
          user.phone ? { phone: user.phone } : undefined,
          {
            firstName: { equals: user.firstName, mode: 'insensitive' },
            lastName: { equals: user.lastName, mode: 'insensitive' },
          },
        ].filter(Boolean) as any,
      },
      include: {
        receptionist: {
          select: { id: true, displayName: true, firstName: true, lastName: true },
        },
        service: true,
        medicalHistories: { orderBy: { eventDate: 'desc' } },
        familyContacts: true,
        vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 20 },
        consultations: { orderBy: { createdAt: 'desc' }, take: 20, include: { provider: true } },
        prescriptions: { orderBy: { prescribingDate: 'desc' }, take: 20, include: { prescriber: true, lineItems: true } },
        labRequests: { orderBy: { requestedAt: 'desc' }, take: 20, include: { results: true } },
        imagingRequests: { orderBy: { createdAt: 'desc' }, take: 20, include: { report: true } },
        appointments: { orderBy: { scheduledAt: 'desc' }, take: 20, include: { serviceUnit: true } },
        hospitalizations: { orderBy: { admittedAt: 'desc' }, take: 10 },
        invoices: { orderBy: { issuedAt: 'desc' }, take: 20, include: { payments: true } },
      },
    });

    if (!patient) {
      throw new NotFoundException('Fiche patient introuvable pour ce compte.');
    }

    return patient;
  }

  async createAdmission(createAdmissionDto: any, actorId?: string) {
    let email = normalizeEmail(createAdmissionDto.email);
    const phone = normalizePhone(createAdmissionDto.phone);
    const { firstName, lastName } = createAdmissionDto.fullName
      ? splitFullName(createAdmissionDto.fullName)
      : { firstName: createAdmissionDto.firstName || '', lastName: createAdmissionDto.lastName || '' };

    if (!firstName || !lastName) {
      throw new BadRequestException('Le prénom et le nom du patient doivent être fournis.');
    }

    email = email || `${this.slugifyUsername(`${firstName}${lastName}`)}@gmail.com`;

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

    // Resolve service only for orientation / assignment. Admission billing uses the linked service tariff when available.
    let resolvedService: any = null;
    if (createAdmissionDto.serviceId) {
      resolvedService = await this.prisma.service.findUnique({ where: { id: createAdmissionDto.serviceId } });
    } else if (createAdmissionDto.service) {
      resolvedService = await this.prisma.service.findUnique({ where: { name: createAdmissionDto.service } });
    }

    const isParamedicalVoucher = String(createAdmissionDto.admissionType || '').toUpperCase() === 'BON_PARAMEDICAL';
    const isCorporateSubscriber = Boolean(String(createAdmissionDto.insuranceProvider || '').trim());
    const resolvedTariff = resolvedService
      ? await this.prisma.serviceTarif.findFirst({
          where: { serviceId: resolvedService.id, actif: true },
          orderBy: [{ dateDebut: 'desc' }, { createdAt: 'desc' }],
          select: { prix: true },
        })
      : null;
    const serviceFee = Number(resolvedTariff?.prix || 0);
    const admissionFee = isParamedicalVoucher
      ? Number(createAdmissionDto.amountDue || 0)
      : serviceFee > 0
        ? serviceFee
        : Number(createAdmissionDto.amountDue || 0);

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
      workflowStatus: isCorporateSubscriber ? PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
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
          type: isParamedicalVoucher ? 'SERVICE' : 'ADMISSION_FEE',
          remarks: isParamedicalVoucher
            ? `Bon paramedical ${createAdmissionDto.voucherNumber || 'sans numero'} - ${resolvedService?.name || createAdmissionDto.service || ''}`
            : `Frais de fiche d'admission - ${resolvedService?.name || createAdmissionDto.service || ''} - ${admissionFee} FC`,
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
          voucher: isParamedicalVoucher
            ? {
                number: createAdmissionDto.voucherNumber || null,
                issuer: createAdmissionDto.voucherIssuer || null,
                notes: createAdmissionDto.voucherNotes || null,
                serviceId: resolvedService?.id || createAdmissionDto.serviceId || null,
                serviceName: resolvedService?.name || createAdmissionDto.service || null,
              }
            : null,
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
          voucherNumber: createAdmissionDto.voucherNumber || null,
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

    if (!isCorporateSubscriber) {
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
              message: isParamedicalVoucher
                ? `Le patient ${result.patient.firstName} ${result.patient.lastName} attend le paiement du bon paramedical ${createAdmissionDto.voucherNumber || ''}.`
                : `Le patient ${result.patient.firstName} ${result.patient.lastName} attend le reglement des frais de fiche d'admission de ${admissionFee} FC.`,
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
    }

    this.notificationsGateway.notify('patient.created', result.patient);

    return {
      patient: result.patient,
      invoice: result.invoice,
      message: isCorporateSubscriber
        ? 'Admission enregistrée pour abonné entreprise. Paiement géré par la société et non requis immédiatement.'
        : 'Admission enregistrée et facture créée. Le caissier a été notifié.',
    };
  }

  async update(id: string, updatePatientDto: UpdatePatientDto) {
    const existing = await this.findOne(id);

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
    if (
      updatePatientDto.workflowStatus === PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE &&
      existing.workflowStatus !== PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE
    ) {
      await this.ensurePatientUserAndNotifyReceptionist(updated.id);
    }
    this.notificationsGateway.notify('patient.updated', updated);
    return updated;
  }

  private async ensurePatientUserAndNotifyReceptionist(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        receptionist: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
      },
    });

    if (!patient) return null;

    const usernameBase = this.slugifyUsername(`${patient.firstName}_${patient.lastName}`);
    const username = await this.makeUniqueUsername(usernameBase);
    const email = patient.email?.trim().toLowerCase() || `${username}@patient.d7.local`;
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username: usernameBase }],
      },
    });

    const patientPosition = await this.prisma.patient.count({
      where: {
        createdAt: {
          lte: patient.createdAt,
        },
      },
    });
    const year = new Date().getFullYear();
    const password = `D7P-${(patient.firstName[0] || 'P').toUpperCase()}${(patient.lastName[0] || 'T').toUpperCase()}${patientPosition}${year}`;

    const patientUser =
      existingUser ||
      (await this.prisma.user.create({
        data: {
          email,
          username,
          displayName: `${patient.firstName} ${patient.lastName}`.trim(),
          firstName: patient.firstName,
          lastName: patient.lastName,
          passwordHash: await bcrypt.hash(password, 10),
          primaryRole: 'PATIENT',
          phone: patient.phone,
          nationality: patient.nationality,
          addressCity: patient.city,
        },
      }));

    if (!patient.receptionistId) {
      return { patientUser, username: patientUser.username, password };
    }

    const messageText = [
      `Acces patient crees pour ${patient.firstName} ${patient.lastName}.`,
      `Nom utilisateur: ${patientUser.username}`,
      `Mot de passe: ${existingUser ? 'deja communique lors de la creation initiale' : password}`,
      `Merci de remettre ces acces au patient pour son interface patient.`,
    ].join('\n');

    const message = await this.prisma.chatMessage.create({
      data: {
        senderId: patientUser.id,
        recipientId: patient.receptionistId,
        recipientType: 'USER',
        text: messageText,
        status: 'SENT',
      },
    });

    const realtimePayload = {
      id: message.id,
      senderId: patientUser.id,
      senderName: patientUser.displayName,
      recipientId: patient.receptionistId,
      recipientName: patient.receptionist?.displayName,
      recipientType: 'USER',
      text: message.text,
      sentAt: message.createdAt.toISOString(),
    };

    this.notificationsGateway.notify('message.received', realtimePayload);
    await this.prisma.notification.create({
      data: {
        recipientId: patient.receptionistId,
        patientId: patient.id,
        type: 'SYSTEM',
        status: 'UNREAD',
        priority: 'HIGH',
        title: 'Acces patient disponibles',
        message: messageText,
        relatedEntity: 'User',
        relatedId: patientUser.id,
      },
    });

    return { patientUser, username: patientUser.username, password };
  }

  private slugifyUsername(value: string) {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || `patient_${Date.now()}`;
  }

  private async makeUniqueUsername(base: string) {
    let candidate = base;
    let suffix = 1;
    while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
      suffix += 1;
      candidate = `${base}_${suffix}`;
    }
    return candidate;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }

  async getPatientsAwaitingPayment() {
    // Récupère les patients avec workflowStatus EN_ATTENTE_DE_PAIEMENT ou EN_ATTENTE_VALIDATION_CAISSE
    // qui ont au moins une facture non payée ou partiellement payée liée à l'admission, au laboratoire ou à la pharmacie.
    const patients = await this.prisma.patient.findMany({
      where: {
        workflowStatus: {
          in: [
            PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
            PatientWorkflowStatus.EN_ATTENTE_VALIDATION_CAISSE,
          ],
        },
      },
      include: {
        invoices: {
          where: {
            type: { in: ['ADMISSION_FEE', 'SERVICE', 'LABORATORY', 'PHARMACY'] },
            OR: [{ status: { in: ['PENDING', 'PARTIALLY_PAID'] } }, { balanceDue: { gt: 0 } }],
          },
          orderBy: {
            issuedAt: 'desc',
          },
          take: 5,
        },
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
      },
      orderBy: {
        arrivalAt: 'desc',
      },
    });

    // Format response for frontend
    return patients.map((patient) => ({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      email: patient.email,
      workflowStatus: patient.workflowStatus,
      arrivalAt: patient.arrivalAt,
      createdAt: patient.createdAt,
      service: patient.service?.name || 'N/A',
      serviceId: patient.service?.id,
      receptionist: patient.receptionist
        ? `${patient.receptionist.displayName || `${patient.receptionist.firstName} ${patient.receptionist.lastName}`.trim()}`
        : 'N/A',
      invoice: patient.invoices[0]
        ? {
            id: patient.invoices[0].id,
            totalAmount: patient.invoices[0].totalAmount,
            balanceDue: patient.invoices[0].balanceDue,
            status: patient.invoices[0].status,
            issuedAt: patient.invoices[0].issuedAt,
            dueDate: patient.invoices[0].dueDate,
          }
        : null,
    }));
  }

  async getPatientsAwaitingNurseVitals() {
    const urgentPriorities = ['URGENT', 'URGENCE', 'HIGH', 'HAUTE', 'CRITICAL', 'CRITIQUE', 'PRIORITAIRE'];

    const patients = await this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        OR: [
          { workflowStatus: PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE },
          { priority: { in: urgentPriorities, mode: 'insensitive' } },
        ],
      },
      include: {
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
        vitalSigns: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            recordedAt: 'desc',
          },
          take: 12,
        },
      },
      orderBy: [
        { priority: 'desc' },
        { arrivalAt: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return patients.map((patient) => {
      const latestVitals = patient.vitalSigns.reduce<Record<string, string>>((acc, vital) => {
        if (!acc[vital.type]) {
          acc[vital.type] = vital.value;
        }
        return acc;
      }, {});

      return {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        middleName: patient.middleName,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth,
        phone: patient.phone,
        email: patient.email,
        workflowStatus: patient.workflowStatus,
        priority: patient.priority,
        arrivalAt: patient.arrivalAt,
        createdAt: patient.createdAt,
        service: patient.service?.name || null,
        serviceId: patient.service?.id || null,
        receptionist: patient.receptionist
          ? patient.receptionist.displayName || `${patient.receptionist.firstName} ${patient.receptionist.lastName}`.trim()
          : null,
        vitals: {
          temperature: latestVitals[VitalType.TEMPERATURE] || null,
          bloodPressure: latestVitals[VitalType.BLOOD_PRESSURE] || null,
          spo2: latestVitals[VitalType.OXYGEN_SATURATION] || null,
          heartRate: latestVitals[VitalType.HEART_RATE] || null,
          respiratoryRate: latestVitals[VitalType.RESPIRATORY_RATE] || null,
          weight: latestVitals[VitalType.WEIGHT] || null,
          height: latestVitals[VitalType.HEIGHT] || null,
          chestCircumference: latestVitals['CHEST_CIRCUMFERENCE'] || null,
          armCircumference: latestVitals['ARM_CIRCUMFERENCE'] || null,
        },
        lastVitalRecordedAt: patient.vitalSigns[0]?.recordedAt || null,
      };
    });
  }

  async getNurseOrientationHistory(period: 'today' | 'yesterday' | 'week' | 'all' = 'today') {
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (period === 'today') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'yesterday') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    } else if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    }

    const where: Prisma.MedicalHistoryWhereInput = {
      deletedAt: null,
      kind: 'NURSE_ORIENTATION',
      patient: {
        deletedAt: null,
      },
    };

    if (startDate && endDate) {
      where.eventDate = { gte: startDate, lt: endDate };
    } else if (startDate) {
      where.eventDate = { gte: startDate };
    }

    const history = await this.prisma.medicalHistory.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            service: {
              select: {
                name: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        eventDate: 'desc',
      },
      take: 50,
    });

    return history.map((item) => {
      let details: any = {};
      try {
        details = item.details ? JSON.parse(item.details) : {};
      } catch {
        details = {};
      }

      return {
        id: item.id,
        patientId: item.patientId,
        patientName: item.patient ? `${item.patient.firstName} ${item.patient.lastName}`.trim() : null,
        service: item.patient?.service?.name || null,
        physicianId: details.physicianId || null,
        physicianName: details.physicianName || null,
        nurseName: item.createdBy
          ? item.createdBy.displayName || `${item.createdBy.firstName || ''} ${item.createdBy.lastName || ''}`.trim()
          : null,
        eventDate: item.eventDate.toISOString(),
        notes: details.notes || null,
      };
    });
  }

  async recordVitalSigns(patientId: string, dto: RecordVitalSignsDto, recordedById?: string) {
    await this.findOne(patientId);

    const rows = [
      { type: VitalType.TEMPERATURE, value: dto.temperature, unit: '°C' },
      { type: VitalType.BLOOD_PRESSURE, value: dto.bloodPressure, unit: 'mmHg' },
      { type: VitalType.OXYGEN_SATURATION, value: dto.spo2, unit: '%' },
      { type: VitalType.HEART_RATE, value: dto.heartRate, unit: 'bpm' },
      { type: VitalType.RESPIRATORY_RATE, value: dto.respiratoryRate, unit: '/min' },
      { type: VitalType.WEIGHT, value: dto.weight, unit: 'kg' },
      { type: VitalType.HEIGHT, value: dto.height, unit: 'cm' },
      { type: 'CHEST_CIRCUMFERENCE' as any, value: dto.chestCircumference, unit: 'cm' },
      { type: 'ARM_CIRCUMFERENCE' as any, value: dto.armCircumference, unit: 'cm' },
    ]
      .filter((row) => Boolean(row.value?.trim()))
      .map((row) => ({
        type: row.type,
        value: row.value!.trim(),
        unit: row.unit,
      }));

    if (rows.length === 0) {
      return this.findOne(patientId);
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { serviceId: true, firstName: true, lastName: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.vitalSign.createMany({
        data: rows.map((row) => ({
          patientId,
          recordedById,
          type: row.type,
          value: row.value,
          unit: row.unit,
          note: dto.notes?.trim() || null,
        })),
      });

      let consultation = null;
      let workflowStatus: PatientWorkflowStatus = PatientWorkflowStatus.EN_ATTENTE_MEDECIN;

      if (dto.physicianId) {
        const physician = await tx.user.findUnique({
          where: { id: dto.physicianId },
          select: {
            displayName: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        });

        const physicianName = physician
          ? physician.displayName || [physician.firstName, physician.lastName].filter(Boolean).join(' ') || physician.username
          : null;

        const appointment = await tx.appointment.create({
          data: {
            patientId,
            requestedById: recordedById,
            scheduledAt: new Date(),
            reason: `Orientation apres signes vitaux${dto.notes ? ` - ${dto.notes.trim()}` : ''}`,
            status: 'CHECKED_IN',
            durationMinutes: 30,
          },
        });

        consultation = await tx.consultation.create({
          data: {
            patientId,
            appointmentId: appointment.id,
            providerId: dto.physicianId,
            status: 'DRAFT',
            chiefComplaint: 'Patient oriente par l infirmier apres prise des signes vitaux',
            clinicalSummary: dto.notes?.trim() || null,
          },
        });

        await tx.medicalHistory.create({
          data: {
            patientId,
            eventDate: new Date(),
            kind: 'NURSE_ORIENTATION',
            details: JSON.stringify({
              physicianId: dto.physicianId,
              physicianName,
              recordedById,
              appointmentId: appointment.id,
              consultationId: consultation.id,
              notes: dto.notes || null,
            }),
            createdById: recordedById,
          },
        });

        workflowStatus = PatientWorkflowStatus.EN_CONSULTATION;
      }

      await tx.patient.update({
        where: { id: patientId },
        data: {
          workflowStatus,
        },
      });

      return consultation;
    });

    this.notificationsGateway.notify('patient.updated', {
      id: patientId,
      workflowStatus: result ? PatientWorkflowStatus.EN_CONSULTATION : PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
    });
    if (result) {
      this.notificationsGateway.notify('consultation.created', result);
    }

    return this.findOne(patientId);
  }

  async getPatientsAssignedToDoctor(doctorId?: string) {
    if (!doctorId) return [];

    const patients = await this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        consultations: {
          some: {
            providerId: doctorId,
            deletedAt: null,
          },
        },
      },
      include: {
        service: { select: { id: true, name: true } },
        vitalSigns: { orderBy: { recordedAt: 'desc' }, take: 10 },
        consultations: {
          where: { providerId: doctorId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { appointment: true, prescriptions: { include: { lineItems: true } } },
        },
        labRequests: { orderBy: { requestedAt: 'desc' }, take: 5, include: { results: true } },
        imagingRequests: { orderBy: { createdAt: 'desc' }, take: 5, include: { report: true } },
        prescriptions: { orderBy: { prescribingDate: 'desc' }, take: 5, include: { lineItems: true } },
        appointments: { where: { deletedAt: null }, orderBy: { scheduledAt: 'desc' }, take: 10 },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return patients.map((patient) => ({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      phone: patient.phone,
      email: patient.email,
      workflowStatus: patient.workflowStatus,
      priority: patient.priority,
      service: patient.service?.name || null,
      serviceId: patient.service?.id || null,
      vitalSigns: patient.vitalSigns,
      consultations: patient.consultations,
      labRequests: patient.labRequests,
      imagingRequests: patient.imagingRequests,
      prescriptions: patient.prescriptions,
      appointments: patient.appointments,
      latestConsultation: patient.consultations[0] || null,
      hasPendingAppointmentWithoutConsultation:
        patient.appointments.some((appt) => appt.status !== 'CANCELLED') && patient.consultations.length === 0,
    }));
  }

  async getPatientsVisibleToDoctors(doctorId?: string) {
    if (!doctorId) return [];

    const patients = await this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            consultations: {
              some: {
                deletedAt: null,
              },
            },
          },
          {
            appointments: {
              some: {
                deletedAt: null,
              },
            },
          },
        ],
      },
      include: {
        service: true,
        familyContacts: true,
        vitalSigns: {
          orderBy: { recordedAt: 'desc' },
          take: 20,
          include: { recordedBy: { select: { id: true, displayName: true, firstName: true, lastName: true } } },
        },
        medicalHistories: {
          orderBy: { eventDate: 'desc' },
          take: 30,
          include: { createdBy: { select: { id: true, displayName: true, firstName: true, lastName: true, primaryRole: true } } },
        },
        consultations: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            provider: { select: { id: true, displayName: true, firstName: true, lastName: true, specialty: true } },
            prescriptions: { include: { lineItems: { include: { medication: true } } } },
            labRequests: { include: { results: true, requestedBy: true } },
            imagingRequests: { include: { report: true } },
          },
        },
        labRequests: { orderBy: { requestedAt: 'desc' }, take: 10, include: { results: true, requestedBy: true } },
        imagingRequests: { orderBy: { createdAt: 'desc' }, take: 10, include: { report: true, requestedBy: true } },
        prescriptions: { orderBy: { prescribingDate: 'desc' }, take: 10, include: { lineItems: { include: { medication: true } }, prescriber: true } },
        hospitalizations: { orderBy: { admittedAt: 'desc' }, take: 5, include: { physician: true, nurseInCharge: true } },
        appointments: { where: { deletedAt: null }, orderBy: { scheduledAt: 'desc' }, take: 10 },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const accessByConsultationId = await Promise.all(
      patients.map(async (patient) => {
        const latestConsultation = patient.consultations[0] || null;
        const canWrite = latestConsultation ? await this.canDoctorWriteConsultation(latestConsultation.providerId, doctorId) : false;
        return [patient.id, { latestConsultation, canWrite }] as const;
      }),
    );
    const accessMap = new Map(accessByConsultationId);

    return patients.map((patient) => {
      const access = accessMap.get(patient.id);
      const latestConsultation = access?.latestConsultation || null;
      const assignedDoctor = latestConsultation?.provider || null;
      const hasPendingAppointmentWithoutConsultation =
        patient.appointments?.some((appointment) => appointment.status !== 'CANCELLED') && patient.consultations.length === 0;

      return {
        id: patient.id,
        externalId: patient.externalId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        middleName: patient.middleName,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        profession: patient.profession,
        nationality: patient.nationality,
        bloodType: patient.bloodType,
        workflowStatus: patient.workflowStatus,
        priority: patient.priority,
        admissionType: patient.admissionType,
        service: patient.service,
        familyContacts: patient.familyContacts,
        vitalSigns: patient.vitalSigns,
        medicalHistories: patient.medicalHistories,
        consultations: patient.consultations,
        labRequests: patient.labRequests,
        imagingRequests: patient.imagingRequests,
        prescriptions: patient.prescriptions,
        hospitalizations: patient.hospitalizations,
        latestConsultation,
        assignedDoctor,
        access: {
          mode: access?.canWrite ? 'WRITE' : 'READ_ONLY',
          canWrite: Boolean(access?.canWrite),
          reason: access?.canWrite
            ? latestConsultation?.providerId === doctorId
              ? 'MEDECIN_ASSIGNE'
              : 'REMPLACEMENT_SHIFT_ACTIF'
            : 'LECTURE_MEDICALE_PARTAGEE',
        },
      };
    });
  }

  async canDoctorWriteConsultation(assignedDoctorId?: string | null, doctorId?: string | null) {
    if (!assignedDoctorId || !doctorId) return false;
    if (assignedDoctorId === doctorId) return true;

    const now = new Date();
    const [assignedActiveShift, replacementActiveShift] = await Promise.all([
      this.prisma.shift.findFirst({
        where: {
          employee: { userId: assignedDoctorId, status: 'ACTIVE' },
          startAt: { lte: now },
          endAt: { gte: now },
        },
      }),
      this.prisma.shift.findFirst({
        where: {
          employee: { userId: doctorId, status: 'ACTIVE' },
          startAt: { lte: now },
          endAt: { gte: now },
        },
      }),
    ]);

    return !assignedActiveShift && Boolean(replacementActiveShift);
  }
}
