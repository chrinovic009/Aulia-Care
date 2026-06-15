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
    this.notificationsGateway.notify('patient.created', result.patient);

    return {
      patient: result.patient,
      invoice: result.invoice,
      message: 'Admission enregistrée et facture créée. Le caissier a été notifié.',
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
    // qui ont une facture de frais d'admission non payée ou partiellement payée
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
            type: 'ADMISSION_FEE',
          },
          orderBy: {
            issuedAt: 'desc',
          },
          take: 1,
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
        },
        lastVitalRecordedAt: patient.vitalSigns[0]?.recordedAt || null,
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

      await tx.patient.update({
        where: { id: patientId },
        data: {
          workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
        },
      });

      let consultation = null;
      if (dto.physicianId) {
        const appointment = await tx.appointment.create({
          data: {
            patientId,
            requestedById: recordedById,
            serviceUnitId: patient?.serviceId || undefined,
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
              recordedById,
              appointmentId: appointment.id,
              consultationId: consultation.id,
              notes: dto.notes || null,
            }),
            createdById: recordedById,
          },
        });
      }

      return consultation;
    });

    this.notificationsGateway.notify('patient.updated', { id: patientId, workflowStatus: PatientWorkflowStatus.EN_ATTENTE_MEDECIN });
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
      latestConsultation: patient.consultations[0] || null,
    }));
  }
}
