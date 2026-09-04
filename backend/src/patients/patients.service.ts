import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AuditAction, PatientWorkflowStatus, RoleSlug, VitalType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { RecordVitalSignsDto } from './dto/record-vital-signs.dto';
import { CreateDailyCheckinDto } from './dto/create-daily-checkin.dto';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { AuthenticatedActor, ClinicContextService, OperationalClinicActor } from '../core/clinic-context.service';
import * as bcrypt from 'bcrypt';

interface PatientSearchParams {
  email?: string;
  phone?: string;
  name?: string;
}

interface AdmissionFamilyContact {
  name: string;
  relation?: string;
  phone?: string;
  address?: string;
  email?: string;
}

type AdmissionInput = Omit<CreateAdmissionDto, 'familyContacts'> & {
  fullName?: string;
  service?: string;
  familyContacts?: AdmissionFamilyContact[];
};


interface AdmissionService {
  id: string;
  name: string;
  active: boolean;
  isParamedical: boolean;
  clinicId: string | null;
  tarifs: Array<{ prix: Prisma.Decimal }>;
}

interface NurseOrientationDetails {
  physicianId?: string;
  physicianName?: string;
  notes?: string;
}

const normalizePhone = (phone?: string) => phone?.replace(/[^0-9+]/g, '').trim();
const normalizeEmail = (email?: string) => email?.trim().toLowerCase();
const ADMISSION_ACTOR_ROLES = new Set<RoleSlug>([
  RoleSlug.RECEPTIONIST,
  RoleSlug.ADMIN,
]);
const VITALS_ACTOR_ROLES = new Set<RoleSlug>([
  RoleSlug.NURSE,
  RoleSlug.ADMIN,
]);

const splitFullName = (value: string) => {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts.slice(-1).join(' ') : firstName;
  return { firstName, lastName };
};

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private requireOperationalActor(
    actor?: AuthenticatedActor,
  ): Promise<OperationalClinicActor> {
    return this.clinicContext.requireOperationalActor(actor);
  }

  private requireOperationalActorById(
    userId?: string,
  ): Promise<OperationalClinicActor> {
    return this.clinicContext.requireOperationalActor({ userId });
  }

  /**
   * This helper is intentionally the only detailed patient fetch in this
   * service.  Callers must resolve a tenant actor before reaching it.
   */
  private async findOneInClinic(id: string, clinicId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinicId, deletedAt: null },
      include: {
        medicalHistories: { orderBy: { eventDate: 'desc' } },
        familyContacts: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable dans cet établissement.');
    }

    return patient;
  }

  private normalizeText(value?: string | null) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private getVisibleLabRequestsWhere(): Prisma.LabRequestWhereInput {
    return {
      deletedAt: null,
      status: {
        not: 'CANCELLED',
      },
    };
  }

  private async resolveBillableServiceForAdmission(
    createAdmissionDto: AdmissionInput,
    resolvedService: AdmissionService | null,
    isParamedicalVoucher: boolean,
    clinicId: string,
  ): Promise<AdmissionService> {
    if (isParamedicalVoucher) {
      if (!resolvedService?.id) {
        throw new BadRequestException('Veuillez choisir le service paramedical demande par le bon.');
      }
      return resolvedService;
    }

    if (createAdmissionDto.billingServiceId) {
      const service = await this.prisma.service.findFirst({
        where: {
          id: createAdmissionDto.billingServiceId,
          clinicId,
          active: true,
        },
        include: { tarifs: { where: { actif: true }, orderBy: { dateDebut: 'desc' }, take: 1 } },
      });
      if (!service || !service.active) throw new BadRequestException('Service de facturation reception introuvable ou inactif.');
      const serviceName = this.normalizeText(service.name);
      if (!serviceName.includes('consultation generale - reception') && !serviceName.includes('consultation specialiste - reception')) {
        throw new BadRequestException('La réception ne peut facturer que la fiche d’admission généraliste ou spécialiste configurée.');
      }
      return service;
    }

    throw new BadRequestException('Choisissez un tarif de fiche d’admission configuré par la réception.');
  }

  private getActiveServicePrice(service: AdmissionService) {
    const activeTarif = service?.tarifs?.[0];
    const price = Number(activeTarif?.prix);
    if (!Number.isFinite(price) || price <= 0) {
      throw new BadRequestException(`Aucun tarif actif CDF n est configure pour le service ${service?.name || 'selectionne'}.`);
    }
    return price;
  }

  async create(
    createPatientDto: CreatePatientDto,
    currentUser?: AuthenticatedActor,
  ) {
    const actor = await this.requireOperationalActor(currentUser);
    const { service, receptionist, ...patientData } = createPatientDto;

    if (service) {
      const scopedService = await this.prisma.service.findFirst({
        where: { id: service, clinicId: actor.clinicId, active: true },
        select: { id: true },
      });
      if (!scopedService) {
        throw new NotFoundException('Service introuvable dans cet établissement.');
      }
    }

    if (receptionist) {
      const scopedReceptionist = await this.prisma.user.findFirst({
        where: {
          id: receptionist,
          clinicId: actor.clinicId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!scopedReceptionist) {
        throw new NotFoundException('Réceptionniste introuvable dans cet établissement.');
      }
    }

    const createPayload: Prisma.PatientCreateInput = {
      ...patientData,
      clinic: { connect: { id: actor.clinicId } },
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

  async findAll(
    currentUser?: AuthenticatedActor,
    requestedPage?: number,
    requestedLimit?: number,
  ) {
    const actor = await this.requireOperationalActor(currentUser);
    const role = String(actor.primaryRole || '').toUpperCase();

    const page =
      Number.isFinite(requestedPage) && requestedPage! > 0
        ? Math.floor(requestedPage!)
        : 1;

    // A list is intentionally small by default. Larger exports must use a dedicated,
    // audited reporting endpoint rather than loading personal data into a browser.
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit! > 0
        ? Math.min(Math.floor(requestedLimit!), 50)
        : 10;

    const paginate =
      Number.isFinite(requestedPage) ||
      Number.isFinite(requestedLimit);

    const where: Prisma.PatientWhereInput = {
      deletedAt: null,
      clinicId: actor.clinicId,
    };

    // Cashiers only need enough identity to identify the invoice owner;
    // they do not need clinical/contact data.
    if (role === 'CASHIER') {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.patient.findMany({
          where,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            externalId: true,
            workflowStatus: true,
            admissionType: true,
            arrivalAt: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          skip: (page - 1) * limit,
          take: limit,
        }),

        this.prisma.patient.count({
          where,
        }),
      ]);

      return paginate
        ? {
            items,
            total,
            page,
            limit,
            totalPages: Math.max(
              1,
              Math.ceil(total / limit),
            ),
          }
        : items;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
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
        orderBy: {
          updatedAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),

      this.prisma.patient.count({
        where,
      }),
    ]);

    return paginate
      ? {
          items,
          total,
          page,
          limit,
          totalPages: Math.max(
            1,
            Math.ceil(total / limit),
          ),
        }
      : items;
  }

  async getReceptionVisits(actorId?: string, requestedLimit = 100) {
    const limit = Math.min(Math.max(requestedLimit, 1), 250);
    const actor = await this.requireOperationalActorById(actorId);

    return this.prisma.patientVisit.findMany({
      where: {
        clinicId: actor.clinicId,
        patient: {
          clinicId: actor.clinicId,
          deletedAt: null,
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            externalId: true,
            firstName: true,
            middleName: true,
            lastName: true,
            phone: true,
            insuranceProvider: true,
            insuranceNumber: true,
          },
        },
        receptionist: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
          },
        },
        invoice: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            balanceDue: true,
          },
        },
        appointment: {
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            statusReason: true,
          },
        },
      },
      orderBy: {
        arrivedAt: 'desc',
      },
      take: limit,
    });
  }

  async search(
    params: PatientSearchParams,
    currentUser?: AuthenticatedActor,
  ) {
    const actor = await this.requireOperationalActor(currentUser);
    const role = String(
      actor.primaryRole || '',
    ).toUpperCase();

    if (
      ![
        'SUPER_ADMIN',
        'ADMIN',
        'RECEPTIONIST',
        'NURSE',
        'PHYSICIAN',
        'CASHIER',
      ].includes(role)
    ) {
      throw new ForbiddenException(
        'Votre rôle ne peut pas rechercher des dossiers patients.',
      );
    }

    if (!params.email && !params.phone && !params.name) {
      throw new BadRequestException(
        'Un critère de recherche patient est obligatoire.',
      );
    }

    const clinicId = actor.clinicId;
    const conditions: Prisma.PatientWhereInput[] = [];

    if (params.email) {
      const email = normalizeEmail(params.email);

      if (email) {
        conditions.push({
          email,
        });
      }
    }

    if (params.phone) {
      const phone = normalizePhone(params.phone);

      if (phone) {
        conditions.push({
          phone: {
            contains: phone,
          },
        });
      }
    }

    if (params.name) {
      const name = params.name.trim();

      // PostgreSQL unaccent search, fully parameterized
      // and always scoped to the authenticated clinic.
      try {
        const pattern = `%${name.replace(/%/g, '\\%')}%`;

        const raw =
          await this.prisma.$queryRaw<
            Array<{
              id: string;
              firstName: string;
              lastName: string;
              middleName: string | null;
              phone: string | null;
              email: string | null;
              dateOfBirth: Date;
            }>
          >(
            Prisma.sql`
              SELECT
                id,
                "firstName",
                "lastName",
                "middleName",
                "phone",
                "email",
                "dateOfBirth"
              FROM "Patient"
              WHERE "deletedAt" IS NULL
                AND "clinicId" = ${clinicId}
                AND unaccent(
                  lower(
                    concat(
                      "firstName",
                      ' ',
                      "lastName"
                    )
                  )
                ) LIKE unaccent(lower(${pattern}))
              LIMIT 10
            `,
          );

        if (raw && raw.length > 0) {
          return role === 'CASHIER'
            ? raw.map(
                ({
                  id,
                  firstName,
                  lastName,
                  dateOfBirth,
                }) => ({
                  id,
                  firstName,
                  lastName,
                  dateOfBirth,
                }),
              )
            : raw;
        }
      } catch {
        // Fallback to Prisma insensitive contains search.
        // Tenant isolation is preserved here as well.
        const { firstName, lastName } =
          splitFullName(name);

        conditions.push({
          OR: [
            {
              firstName: {
                contains: firstName,
                mode: 'insensitive',
              },
            },
            {
              lastName: {
                contains: lastName,
                mode: 'insensitive',
              },
            },
            {
              OR: [
                {
                  firstName: {
                    contains: name,
                    mode: 'insensitive',
                  },
                },
                {
                  lastName: {
                    contains: name,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          ],
        });
      }
    }

    if (conditions.length === 0) {
      return [];
    }

    return this.prisma.patient.findMany({
      where: {
        deletedAt: null,
        clinicId,
        OR: conditions,
      },
      select:
        role === 'CASHIER'
          ? {
              id: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              externalId: true,
            }
          : {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              dateOfBirth: true,
              phone: true,
              email: true,
              externalId: true,
              workflowStatus: true,
            },
      take: 20,
    });
  }

    /** Lecture administrative d'un dossier : elle reste strictement tenant-scopée.
     * Les règles de prise en charge propres au médecin restent dans
     * `findOneForDoctor`. */
  async findOneForActor(id: string, actorId?: string) {
    const actor = await this.requireOperationalActorById(actorId);
    return this.findOneInClinic(id, actor.clinicId);
  }

  private isNurseOrientationDetails(value: unknown): value is NurseOrientationDetails {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const details = value as Record<string, unknown>;
    return ['physicianId', 'physicianName', 'notes'].every(
      (key) => details[key] === undefined || typeof details[key] === 'string',
    );
  }

  async findOneForDoctor(id: string, doctorId?: string) {
  const doctor = await this.requireOperationalActorById(doctorId);
  if (doctor.primaryRole !== RoleSlug.PHYSICIAN) {
    throw new ForbiddenException('Ce parcours est réservé au médecin authentifié.');
  }

  const isInCareTeam = await this.prisma.patient.count({
    where: {
      id,
      deletedAt: null,
      clinicId: doctor.clinicId,
      OR: [
        {
          consultations: {
            some: {
              providerId: doctor.id,
              deletedAt: null,
            },
          },
        },
        {
          hospitalizations: {
            some: {
              physicianId: doctor.id,
              deletedAt: null,
            },
          },
        },
        {
          workflowStatus:
            PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
        },
      ],
    },
  });

  if (!isInCareTeam) {
    throw new ForbiddenException(
      'Accès au dossier patient non autorisé.',
    );
  }

  return this.findOneInClinic(id, doctor.clinicId);
  }

  async getPatientProfileForUser(userId: string) {
    if (!userId) {
      throw new ForbiddenException(
        'Utilisateur authentifié requis.',
      );
    }

    /*
    * Le compte patient est une identité portail.
    * Son accès au dossier médical repose exclusivement sur
    * la relation explicite Patient.portalUserId.
    *
    * Aucune correspondance par nom, téléphone ou e-mail
    * n'est autorisée ici.
    */
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        primaryRole: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      !user ||
      user.deletedAt ||
      user.status !== 'ACTIVE'
    ) {
      throw new ForbiddenException(
        'Compte utilisateur actif requis.',
      );
    }

    if (user.primaryRole !== 'PATIENT') {
      throw new ForbiddenException(
        'Ce compte n’est pas autorisé à accéder au portail patient.',
      );
    }

    /*
    * Relation d'autorisation explicite.
    *
    * On ne cherche jamais un dossier via l'e-mail,
    * le téléphone ou l'identité déclarative du compte.
    */
    const portalPatient =
      await this.prisma.patient.findFirst({
        where: {
          portalUserId: user.id,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

    if (!portalPatient) {
      throw new NotFoundException(
        'Aucun dossier patient n’est explicitement lié à ce compte. Contactez la réception.',
      );
    }

    /*
    * Défense en profondeur :
    * même après avoir résolu l'id du patient, la requête finale
    * conserve la relation portalUserId.
    *
    * Ainsi, une incohérence entre les deux requêtes ne peut pas
    * transformer un simple id de patient en autorisation.
    */
    const patient =
      await this.prisma.patient.findFirst({
        where: {
          id: portalPatient.id,
          portalUserId: user.id,
          deletedAt: null,
        },

        include: {
          receptionist: {
            select: {
              id: true,
              displayName: true,
              firstName: true,
              lastName: true,
            },
          },

          service: true,

          medicalHistories: {
            orderBy: {
              eventDate: 'desc',
            },
          },

          familyContacts: true,

          vitalSigns: {
            orderBy: {
              recordedAt: 'desc',
            },
            take: 20,
          },

          consultations: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 20,
            include: {
              provider: {
                select: {
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  specialty: true,
                },
              },
            },
          },

          prescriptions: {
            orderBy: {
              prescribingDate: 'desc',
            },
            take: 20,
            include: {
              prescriber: {
                select: {
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  specialty: true,
                },
              },
              lineItems: {
                include: {
                  medication: {
                    select: {
                      name: true,
                      strength: true,
                      unit: true,
                    },
                  },
                },
              },
            },
          },

          labRequests: {
            where:
              this.getVisibleLabRequestsWhere(),
            orderBy: {
              requestedAt: 'desc',
            },
            take: 20,
            include: {
              results: {
                include: {
                  parameters: {
                    include: {
                      labTestParameter: true,
                    },
                  },
                },
              },
              requestedBy: {
                select: {
                  displayName: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },

          imagingRequests: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 20,
            include: {
              report: true,
            },
          },

          appointments: {
            orderBy: {
              scheduledAt: 'desc',
            },
            take: 20,
            include: {
              serviceUnit: true,
            },
          },

          hospitalizations: {
            orderBy: {
              admittedAt: 'desc',
            },
            take: 10,
            include: {
              ServiceUnit: {
                select: {
                  name: true,
                  location: true,
                },
              },

              physician: {
                select: {
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  specialty: true,
                },
              },

              nurseInCharge: {
                select: {
                  displayName: true,
                  firstName: true,
                  lastName: true,
                },
              },

              nurseAssignments: {
                where: {
                  releasedAt: null,
                },
                include: {
                  nurse: {
                    select: {
                      displayName: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },

              nursingCareTasks: {
                orderBy: {
                  dueAt: 'asc',
                },
                take: 30,
                include: {
                  assignedNurse: {
                    select: {
                      displayName: true,
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },

              medicationAdministrations: {
                orderBy: {
                  scheduledAt: 'desc',
                },
                take: 30,
                include: {
                  prescriptionLine: {
                    include: {
                      medication: {
                        select: {
                          name: true,
                          strength: true,
                          unit: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },

          invoices: {
            orderBy: {
              issuedAt: 'desc',
            },
            take: 20,
            include: {
              payments: true,
              discountRequests: {
                select: {
                  amount: true,
                  status: true,
                  reason: true,
                  reviewedAt: true,
                },
              },
            },
          },
        },
      });

    if (!patient) {
      throw new NotFoundException(
        'Fiche patient introuvable pour ce compte.',
      );
    }

    return patient;
  }

  async createDailyCheckin(
    userId: string,
    dto: CreateDailyCheckinDto,
  ) {
    const profile = await this.getPatientProfileForUser(userId);

    /*
     * A portal identity has no clinicId by design. Its linked Patient is the
     * tenant authority. A daily check-in must fail closed if that record is a
     * legacy record without a clinic, because a notification cannot then be
     * routed safely.
     */
    if (!profile.clinicId) {
      throw new ForbiddenException(
        'Le dossier patient doit être rattaché à un établissement.',
      );
    }

    const normalizedSymptoms = [
      ...new Set(
        (dto.symptoms || [])
          .map((item) => String(item).trim())
          .filter(Boolean),
      ),
    ].slice(0, 20);

    const result = await this.prisma.$transaction(async (tx) => {
      /* Re-check the explicit portal association inside the write transaction. */
      const patient = await tx.patient.findFirst({
        where: {
          id: profile.id,
          portalUserId: userId,
          clinicId: profile.clinicId,
          deletedAt: null,
        },
        select: { id: true, clinicId: true },
      });

      if (!patient?.clinicId) {
        throw new NotFoundException(
          'Le dossier patient n’est plus accessible depuis ce compte.',
        );
      }

      const event = await tx.medicalHistory.create({
        data: {
          patientId: patient.id,
          kind: 'PATIENT_DAILY_CHECKIN',
          details: JSON.stringify({
            feelsWell: dto.feelsWell,
            symptoms: normalizedSymptoms,
            message: dto.message?.trim() || null,
            voiceTranscript: dto.voiceTranscript?.trim() || null,
            submittedAt: new Date().toISOString(),
            source: 'PATIENT_PORTAL',
          }),
        },
      });

      const activeStay = await tx.hospitalization.findFirst({
        where: {
          patientId: patient.id,
          dischargedAt: null,
          status: { in: ['ADMITTED', 'TRANSFERRED'] },
          patient: { clinicId: patient.clinicId, deletedAt: null },
        },
        orderBy: { admittedAt: 'desc' },
        select: {
          nurseInChargeId: true,
          nurseAssignments: {
            where: { releasedAt: null },
            select: { nurseId: true },
          },
        },
      });

      const candidateRecipientIds = [
        ...new Set(
          [
            activeStay?.nurseInChargeId,
            ...(activeStay?.nurseAssignments.map((assignment) => assignment.nurseId) || []),
          ].filter((recipientId): recipientId is string =>
            typeof recipientId === 'string' && recipientId.length > 0,
          ),
        ),
      ];

      /*
       * Assignment rows are never trusted as an authorization source. At the
       * send point every recipient is revalidated as an active NURSE in the
       * same clinic. Stale or corrupt cross-clinic assignments therefore
       * receive no notification.
       */
      const recipients = candidateRecipientIds.length
        ? await tx.user.findMany({
            where: {
              id: { in: candidateRecipientIds },
              clinicId: patient.clinicId,
              status: 'ACTIVE',
              deletedAt: null,
              OR: [
                { primaryRole: RoleSlug.NURSE },
                { roles: { some: { active: true, role: { slug: RoleSlug.NURSE } } } },
              ],
            },
            select: { id: true },
          })
        : [];

      const notifications = await Promise.all(
        recipients.map(({ id: recipientId }) =>
          tx.notification.create({
            data: {
              patientId: patient.id,
              recipientId,
              type: 'TASK',
              priority: dto.feelsWell ? 'MEDIUM' : 'HIGH',
              title: 'Nouveau suivi quotidien patient',
              message: dto.feelsWell
                ? 'Le patient a complété son suivi quotidien.'
                : 'Le patient signale un inconfort : une évaluation humaine est demandée.',
              relatedEntity: 'MedicalHistory',
              relatedId: event.id,
            },
          }),
        ),
      );

      return { event, notifications };
    });

    /* Broadcast only after commit: no client can observe a rolled-back event. */
    for (const notification of result.notifications) {
      this.notificationsGateway.notifyToUser(
        notification.recipientId,
        'patient.daily-checkin.created',
        notification,
      );
    }

    return {
      id: result.event.id,
      submittedAt: result.event.eventDate,
      recipientsNotified: result.notifications.length,
      message: dto.feelsWell
        ? 'Merci pour votre suivi. Continuez à respecter les consignes de votre équipe soignante.'
        : 'Votre signalement a été enregistré et transmis à l’équipe infirmière de votre séjour lorsqu’elle est affectée. En cas d’urgence, contactez immédiatement les services d’urgence.',
    };
  }

  async createAdmission(
    createAdmissionDto: AdmissionInput,
    actorId?: string,
  ) {
    const receptionist = await this.requireOperationalActorById(actorId);
    if (!ADMISSION_ACTOR_ROLES.has(receptionist.primaryRole as RoleSlug)) {
      throw new ForbiddenException('Une admission doit être réalisée par la réception ou l’administration autorisée.');
    }
    const clinicId = receptionist.clinicId;
    const receptionistId = receptionist.id;

    const email = normalizeEmail(createAdmissionDto.email);
    const phone = normalizePhone(createAdmissionDto.phone);

    const existingPatientId =
      String(
        createAdmissionDto.existingPatientId || '',
      ).trim() || null;

    const { firstName, lastName } =
      createAdmissionDto.fullName
        ? splitFullName(createAdmissionDto.fullName)
        : {
            firstName:
              createAdmissionDto.firstName || '',
            lastName:
              createAdmissionDto.lastName || '',
          };

    if (!firstName || !lastName) {
      throw new BadRequestException(
        'Le prénom et le nom du patient doivent être fournis.',
      );
    }

    // No fabricated Gmail address: it creates false unique conflicts
    // and can expose notifications to a third party.
    const conflicts: Prisma.PatientWhereInput[] = [];

    if (email) {
      conflicts.push({
        email,
      });
    }

    if (phone) {
      conflicts.push({
        phone,
      });
    }

    if (
      firstName &&
      lastName &&
      createAdmissionDto.dateOfBirth
    ) {
      conflicts.push({
        AND: [
          {
            firstName: {
              equals: firstName,
              mode: 'insensitive',
            },
          },
          {
            lastName: {
              equals: lastName,
              mode: 'insensitive',
            },
          },
          {
            dateOfBirth: new Date(
              createAdmissionDto.dateOfBirth,
            ),
          },
        ],
      });
    }

    /*
    * Un patient existant ne peut être sélectionné
    * que dans la clinique de l'utilisateur courant.
    */
    const selectedExistingPatient =
      existingPatientId
        ? await this.prisma.patient.findFirst({
            where: {
              id: existingPatientId,
              clinicId,
              deletedAt: null,
            },
          })
        : null;

    if (
      existingPatientId &&
      !selectedExistingPatient
    ) {
      throw new NotFoundException(
        'Le patient choisi pour cette réadmission est introuvable dans cet établissement ou archivé.',
      );
    }

    /*
    * La détection de doublons reste elle aussi strictement
    * limitée à la clinique courante.
    */
    if (
      !selectedExistingPatient &&
      conflicts.length > 0
    ) {
      const existing =
        await this.prisma.patient.findFirst({
          where: {
            clinicId,
            deletedAt: null,
            OR: conflicts,
          },
        });

      if (existing) {
        throw new ConflictException(
          'Un patient existe déjà dans cet établissement avec le même email, téléphone ou nom/date de naissance.',
        );
      }
    }

    let resolvedService: AdmissionService | null = null;

    if (createAdmissionDto.serviceId) {
      resolvedService =
        await this.prisma.service.findFirst({
          where: {
            id: createAdmissionDto.serviceId,
            clinicId,
          },
          include: {
            tarifs: {
              where: {
                actif: true,
              },
              orderBy: {
                dateDebut: 'desc',
              },
              take: 1,
            },
          },
        });
    } else if (createAdmissionDto.service) {
      resolvedService =
        await this.prisma.service.findFirst({
          where: {
            name: createAdmissionDto.service,
            clinicId,
          },
          include: {
            tarifs: {
              where: {
                actif: true,
              },
              orderBy: {
                dateDebut: 'desc',
              },
              take: 1,
            },
          },
        });
    }

    const isParamedicalVoucher =
      String(
        createAdmissionDto.admissionType || '',
      ).toUpperCase() === 'BON_PARAMEDICAL';

    if (isParamedicalVoucher) {
      if (
        !createAdmissionDto.voucherNumber?.trim() ||
        !createAdmissionDto.voucherIssuer?.trim()
      ) {
        throw new BadRequestException(
          'Le numéro et l’émetteur du bon paramédical sont obligatoires.',
        );
      }

      if (
        !resolvedService?.active ||
        !resolvedService?.isParamedical
      ) {
        throw new BadRequestException(
          'Le bon paramédical doit cibler un service paramédical actif.',
        );
      }
    }

    const billableService =
      await this.resolveBillableServiceForAdmission(
        createAdmissionDto,
        resolvedService,
        isParamedicalVoucher,
        clinicId,
      );

    const admissionFee =
      this.getActiveServicePrice(billableService);

    const invoiceType =
      isParamedicalVoucher
        ? 'SERVICE'
        : 'ADMISSION_FEE';

    const isSpecialist =
      admissionFee > 30000 ||
      this.normalizeText(
        createAdmissionDto.consultationKind,
      ).includes('special');

    const invoiceLabel = isParamedicalVoucher
      ? `Bon paramedical - ${billableService.name}`
      : `${
          isSpecialist
            ? 'Consultation Spécialisée'
            : 'Consultation Générale'
        } - Réception`;

    const receptionistConnect = {
      connect: {
        id: receptionistId,
      },
    };

    // Company subscriptions are admitted only through
    // SubscriptionsService, which links a verified employee.
    const isCorporateSubscriber = false;

    const familyContacts = createAdmissionDto.familyContacts?.length
      ? createAdmissionDto.familyContacts.map((contact) => ({
          name: contact.name,
          relationship: contact.relation,
          phone: contact.phone,
          address: contact.address,
          email: contact.email,
        }))
      : null;

    const admissionData: Prisma.PatientCreateInput = {
      firstName,
      lastName,
      middleName: createAdmissionDto.middleName,
      gender: createAdmissionDto.gender,
      dateOfBirth: new Date(
        createAdmissionDto.dateOfBirth,
      ),
      profession:
        createAdmissionDto.profession || undefined,
      email,
      phone,
      address: createAdmissionDto.address,
      city: createAdmissionDto.city,
      postalCode: createAdmissionDto.postalCode,
      nationality: createAdmissionDto.nationality,
      insuranceProvider:
        createAdmissionDto.insuranceProvider,
      insuranceNumber:
        createAdmissionDto.insuranceNumber,

      workflowStatus: isCorporateSubscriber
        ? PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE
        : PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,

      admissionType:
        createAdmissionDto.admissionType,

      priority:
        createAdmissionDto.priority,

      arrivalAt: new Date(),

      /*
      * Jamais undefined.
      * Le clinicId a été validé avant toute opération.
      */
      clinic: { connect: { id: clinicId } },

      ...(resolvedService
        ? {
            service: {
              connect: {
                id: resolvedService.id,
              },
            },
          }
        : {}),

      receptionist: receptionistConnect,

      ...(familyContacts
        ? {
            familyContacts: {
              create: familyContacts,
            },
          }
        : {}),
    };

    const result = await this.prisma.$transaction(
      async (prisma) => {
        const existingPatientInTransaction = selectedExistingPatient
          ? await prisma.patient.findFirst({
              where: {
                id: selectedExistingPatient.id,
                clinicId,
                deletedAt: null,
              },
            })
          : null;

        if (selectedExistingPatient && !existingPatientInTransaction) {
          throw new NotFoundException('Patient introuvable dans cet établissement.');
        }

       const patient = existingPatientInTransaction
  ? await prisma.patient.update({
      where: {
        id: existingPatientInTransaction.id,
        clinicId,
        deletedAt: null,
      },
      data: {
        // Never overwrite a known patient's identity
        // or clinical record at reception.
        receptionistId,

        workflowStatus:
          admissionData.workflowStatus,

        admissionType:
          createAdmissionDto.admissionType,

        priority:
          createAdmissionDto.priority ||
          existingPatientInTransaction.priority,

        arrivalAt: new Date(),

        ...(resolvedService
          ? {
              serviceId:
                resolvedService.id,
            }
          : {}),
      },
    })
  : await prisma.patient.create({
      data: admissionData,
    });

if (isParamedicalVoucher) {
  await prisma.paramedicalVoucher.create({
    data: {
      number:
        createAdmissionDto.voucherNumber.trim(),

      issuer:
        createAdmissionDto.voucherIssuer.trim(),

      serviceId:
        resolvedService.id,

      patientId:
        patient.id,

      notes:
        createAdmissionDto.voucherNotes?.trim() ||
        null,
    },
  });
}

        const invoice =
          await prisma.invoice.create({
            data: {
              patientId: patient.id,
              issuedById: receptionistId,

              /*
              * Toujours la clinique authentifiée.
              */
              clinicId,

              status: 'PENDING',
              issuedAt: new Date(),
              totalAmount: admissionFee,
              balanceDue: admissionFee,
              dueDate: new Date(),
              type: invoiceType,

              remarks: isParamedicalVoucher
                ? `Bon paramedical ${
                    createAdmissionDto.voucherNumber ||
                    'sans numero'
                  } - ${
                    resolvedService?.name ||
                    createAdmissionDto.service ||
                    ''
                  }`
                : invoiceLabel,
            },
          });

        await prisma.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            serviceId: billableService.id,
            label: invoiceLabel,
            quantity: 1,
            unitPrice: admissionFee,
            totalAmount: admissionFee,
          },
        });

        const visit =
          await prisma.patientVisit.create({
            data: {
              patientId: patient.id,
              receptionistId,

              /*
              * Même tenant que patient + facture.
              */
              clinicId,

              invoiceId: invoice.id,

              serviceId:
                resolvedService?.id || null,

              visitType:
                createAdmissionDto.admissionType ||
                'ADMISSION',

              reason:
                createAdmissionDto.consultationKind ||
                createAdmissionDto.admissionType ||
                'Admission réception',

              status: isCorporateSubscriber
                ? 'ORIENTED'
                : 'AWAITING_PAYMENT',

              arrivedAt:
                patient.arrivalAt || new Date(),

              metadata: {
                isReturningPatient:
                  Boolean(selectedExistingPatient),

                consultationKind:
                  isSpecialist
                    ? 'SPECIALIST'
                    : 'GENERAL',

                voucherNumber:
                  createAdmissionDto.voucherNumber ||
                  null,

                invoiceId:
                  invoice.id,
              },
            },
          });

        return {
          patient,
          invoice,
          visit,
        };
      },
    );

    // Compute age and persist admission metadata.
    const dobValue =
      selectedExistingPatient?.dateOfBirth ||
      (createAdmissionDto.dateOfBirth
        ? new Date(createAdmissionDto.dateOfBirth)
        : null);

    const dob = dobValue
      ? new Date(dobValue)
      : null;

    const age = dob
      ? Math.floor(
          (Date.now() - dob.getTime()) /
            (1000 * 60 * 60 * 24 * 365.25),
        )
      : null;

    let receptionistName: string | null = null;

    const rec =
      await this.prisma.user.findUnique({
        where: {
          id: receptionistId,
        },
      });

    receptionistName = rec
      ? rec.displayName ||
        `${rec.firstName || ''} ${
          rec.lastName || ''
        }`.trim()
      : null;

    await this.prisma.medicalHistory.create({
      data: {
        patientId: result.patient.id,
        eventDate: new Date(),
        kind: 'ADMISSION_METADATA',

        details: JSON.stringify({
          dateOfBirth:
            createAdmissionDto.dateOfBirth || null,

          age,

          profession:
            createAdmissionDto.profession || null,

          familyContacts:
            createAdmissionDto.familyContacts || null,

          receptionistName,

          voucher: isParamedicalVoucher
            ? {
                number:
                  createAdmissionDto.voucherNumber ||
                  null,

                issuer:
                  createAdmissionDto.voucherIssuer ||
                  null,

                notes:
                  createAdmissionDto.voucherNotes ||
                  null,

                serviceId:
                  resolvedService?.id ||
                  createAdmissionDto.serviceId ||
                  null,

                serviceName:
                  resolvedService?.name ||
                  createAdmissionDto.service ||
                  null,
              }
            : null,

          consultationKind:
            isSpecialist
              ? 'SPECIALIST'
              : 'GENERAL',

          billingServiceId:
            billableService.id,

          billingServiceName:
            billableService.name,

          billingAmount:
            admissionFee,
        }),

        createdById: receptionistId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: receptionistId,
        patientId:
          result.patient.id,

        action:
          AuditAction.CREATE,

        entity:
          selectedExistingPatient
            ? 'PatientVisit'
            : 'Patient',

        entityId:
          selectedExistingPatient
            ? result.visit.id
            : result.patient.id,

        summary:
          'Admission enregistrée et facture créée.',

        metadata: {
          admissionType:
            createAdmissionDto.admissionType,

          voucherNumber:
            createAdmissionDto.voucherNumber || null,

          service:
            resolvedService?.name ||
            createAdmissionDto.service ||
            null,

          serviceId:
            resolvedService?.id ||
            createAdmissionDto.serviceId ||
            null,

          invoiceId:
            result.invoice.id,
        },
      },
    });

    /*
    * Ici aussi : aucun fallback sans clinicId.
    * Les caissiers d'autres établissements ne doivent jamais
    * recevoir les notifications de cette admission.
    */
    const cashierUsers =
      await this.prisma.user.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
          deletedAt: null,

          OR: [
            {
              primaryRole: 'CASHIER',
            },
            {
              roles: {
                some: {
                  role: {
                    slug: 'CASHIER',
                  },
                },
              },
            },
          ],
        },
      });

    // The patient portal account is issued at the first admission,
    // not only after payment/triage.
    if (!selectedExistingPatient) {
      await this.ensurePatientUserAndNotifyReceptionist(
        result.patient.id,
        clinicId,
      );
    }

    await Promise.all(
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
              : `Le patient ${result.patient.firstName} ${result.patient.lastName} attend le reglement de ${invoiceLabel} (${admissionFee} CDF).`,

            relatedEntity: 'Invoice',
            relatedId: result.invoice.id,
            sendAt: new Date(),
          },
        }),
      ),
    );

    this.notificationsGateway.notify(
      'patient.created',
      result.patient,
    );

    return {
      patient:
        result.patient,

      invoice:
        result.invoice,

      visit:
        result.visit,

      isReturningPatient:
        Boolean(selectedExistingPatient),

      message: isCorporateSubscriber
        ? 'Admission enregistrée pour abonné entreprise. Paiement géré par la société et non requis immédiatement.'
        : 'Admission enregistrée et facture créée. Le caissier a été notifié.',
    };
  }

  async update(
    id: string,
    updatePatientDto: UpdatePatientDto,
    currentUser?: AuthenticatedActor,
  ) {
    const actor = await this.requireOperationalActor(currentUser);
    const actorId = actor.id;

    const existing = await this.prisma.patient.findFirst({
      where: {
        id,
        clinicId: actor.clinicId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException(
        'Patient introuvable dans cet établissement.',
      );
    }

    const role = String(
      actor.primaryRole || '',
    ).toUpperCase();

    const receptionFields = [
      'firstName',
      'lastName',
      'middleName',
      'gender',
      'dateOfBirth',
      'email',
      'phone',
      'address',
      'city',
      'postalCode',
      'nationality',
      'emergencyContact',
      'emergencyPhone',
      'profession',
    ];

    const adminOnlyFields = [
      'insuranceProvider',
      'insuranceNumber',
      'status',
      'admissionType',
      'priority',
      'arrivalAt',
      'workflowStatus',
      'bloodType',
    ];

    const allowedFields =
      role === 'RECEPTIONIST'
        ? receptionFields
        : [...receptionFields, ...adminOnlyFields];

    const patientData = Object.fromEntries(
      Object.entries(updatePatientDto).filter(([key]) =>
        allowedFields.includes(key),
      ),
    );

    if (Object.keys(patientData).length === 0) {
      throw new ForbiddenException(
        'Aucun champ autorisé pour votre rôle.',
      );
    }

    const updatePayload: Prisma.PatientUpdateManyMutationInput = {
      ...patientData,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const mutation = await tx.patient.updateMany({
        where: {
          id: existing.id,
          clinicId: actor.clinicId,
          deletedAt: null,
        },
        data: updatePayload,
      });

      if (!mutation.count) {
        throw new NotFoundException('Patient introuvable dans cet établissement.');
      }

      const scopedPatient = await tx.patient.findFirst({
        where: {
          id: existing.id,
          clinicId: actor.clinicId,
          deletedAt: null,
        },
      });

      if (!scopedPatient) {
        throw new NotFoundException('Patient introuvable dans cet établissement.');
      }

      return scopedPatient;
    });

    if (
      patientData.workflowStatus ===
        PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE &&
      existing.workflowStatus !==
        PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE
    ) {
      await this.ensurePatientUserAndNotifyReceptionist(
        updated.id,
        actor.clinicId,
      );
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        patientId: existing.id,
        action: AuditAction.UPDATE,
        entity: 'Patient',
        entityId: existing.id,
        summary:
          'Données administratives patient mises à jour.',
        metadata: {
          fields: Object.keys(patientData),
        },
      },
    });

    this.notificationsGateway.notify(
      'patient.updated',
      updated,
    );

    return updated;
  }

  private async ensurePatientUserAndNotifyReceptionist(
  patientId: string,
  clinicId: string,
  ) {
  const patient =
    await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId,
        deletedAt: null,
      },
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

  if (!patient || patient.deletedAt) {
    return null;
  }

  if (!patient.clinicId) {
    throw new ForbiddenException(
      'Le dossier patient doit être rattaché à un établissement.',
    );
  }

  /*
    * Si le dossier possède déjà un compte portail,
    * cette relation explicite est la seule source de vérité.
    */
  let patientUser = patient.portalUserId
    ? await this.prisma.user.findUnique({
        where: {
          id: patient.portalUserId,
        },
      })
    : null;

  if (patient.portalUserId) {
    if (
      !patientUser ||
      patientUser.deletedAt ||
      patientUser.status !== 'ACTIVE' ||
      patientUser.primaryRole !== 'PATIENT'
    ) {
      throw new ConflictException(
        'Le compte portail lié à ce dossier patient est invalide.',
      );
    }

    /*
      * Défense contre une incohérence de relation.
      */
    const linkedPatient =
      await this.prisma.patient.findFirst({
        where: {
          portalUserId: patientUser.id,
          deletedAt: null,
        },
        select: {
          id: true,
          clinicId: true,
        },
      });

    if (
      linkedPatient &&
      linkedPatient.id !== patient.id
    ) {
      throw new ConflictException(
        'Le compte portail est déjà lié à un autre dossier patient.',
      );
    }
  }

  const usernameBase =
    this.slugifyUsername(
      `${patient.firstName}_${patient.lastName}`,
    );

  const username =
    await this.makeUniqueUsername(usernameBase);

  const email =
    patient.email?.trim().toLowerCase() ||
    `${username}@patient.aulia.local`;

  /*
    * IMPORTANT :
    * on ne récupère plus automatiquement un utilisateur
    * quelconque via email ou username.
    *
    * Une identité ressemblante n'est pas une autorisation.
    */
  if (!patientUser) {
    const conflictingUser =
      await this.prisma.user.findFirst({
        where: {
          OR: [
            {
              email,
            },
            {
              username,
            },
          ],
        },
        select: {
          id: true,
        },
      });

    if (conflictingUser) {
      throw new ConflictException(
        'Un compte utilisateur existe déjà avec cette adresse e-mail ou ce nom utilisateur. La liaison au dossier patient doit être vérifiée explicitement.',
      );
    }
  }

  /*
    * Le compteur reste temporairement utilisé par le mécanisme
    * historique de génération du mot de passe.
    *
    * Il est désormais limité à la clinique du patient afin
    * d'éviter toute dépendance inter-tenant.
    *
    * La stratégie de mot de passe elle-même sera supprimée
    * pendant l'audit sécurité AC-P005 / Point 5.
    */
  const patientPosition =
    await this.prisma.patient.count({
      where: {
        clinicId: patient.clinicId,
        deletedAt: null,
        createdAt: {
          lte: patient.createdAt,
        },
      },
    });

  const year =
    new Date().getFullYear();

  const password =
    `AUP-${(patient.firstName[0] || 'P').toUpperCase()}` +
    `${(patient.lastName[0] || 'T').toUpperCase()}` +
    `${patientPosition}${year}`;

  let accountWasCreated = false;

  if (!patientUser) {
    patientUser =
      await this.prisma.user.create({
        data: {
          email,
          username,
          displayName:
            `${patient.firstName} ${patient.lastName}`.trim(),
          firstName:
            patient.firstName,
          lastName:
            patient.lastName,
          passwordHash:
            await bcrypt.hash(password, 10),
          primaryRole:
            'PATIENT',
          phone:
            patient.phone,
          nationality:
            patient.nationality,
          addressCity:
            patient.city,
        },
      });

    accountWasCreated = true;
  }

  /*
    * Avant toute liaison, on vérifie explicitement que
    * ce compte portail n'appartient à aucun autre dossier.
    */
  const linkedPatient =
    await this.prisma.patient.findFirst({
      where: {
        portalUserId: patientUser.id,
        deletedAt: null,
      },
      select: {
        id: true,
        clinicId: true,
      },
    });

  if (
    linkedPatient &&
    linkedPatient.id !== patient.id
  ) {
    throw new ConflictException(
      'Le compte portail est déjà lié à un autre dossier patient.',
    );
  }

  if (
    patient.portalUserId !== patientUser.id
  ) {
    await this.prisma.patient.update({
      where: {
        id: patient.id,
        clinicId: patient.clinicId,
        deletedAt: null,
      },
      data: {
        portalUserId: patientUser.id,
      },
    });
  }

  /*
    * Aucun réceptionniste :
    * le compte est créé/lié, mais aucune notification
    * inter-utilisateur n'est envoyée.
    */
  if (!patient.receptionistId) {
    return {
      patientUser,
      username: patientUser.username,
      password:
        accountWasCreated
          ? password
          : undefined,
    };
  }

  /*
    * Le réceptionniste associé au patient doit appartenir
    * au même établissement et être actif.
    */
  const receptionist =
    await this.prisma.user.findFirst({
      where: {
        id: patient.receptionistId,
        clinicId: patient.clinicId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        displayName: true,
      },
    });

  if (!receptionist) {
    throw new ForbiddenException(
      'Le réceptionniste associé au patient n’appartient pas à cet établissement ou n’est plus actif.',
    );
  }

  const messageText = [
    `Acces patient crees pour ${patient.firstName} ${patient.lastName}.`,
    `Nom utilisateur: ${patientUser.username}`,
    `Mot de passe: ${
      accountWasCreated
        ? password
        : 'deja communique lors de la creation initiale'
    }`,
    `Merci de remettre ces acces au patient pour son interface patient.`,
  ].join('\n');

  const message =
    await this.prisma.chatMessage.create({
      data: {
        senderId:
          patientUser.id,
        recipientId:
          receptionist.id,
        recipientType:
          'USER',
        text:
          messageText,
        status:
          'SENT',
      },
    });

  const realtimePayload = {
    id:
      message.id,
    senderId:
      patientUser.id,
    senderName:
      patientUser.displayName,
    recipientId:
      receptionist.id,
    recipientName:
      receptionist.displayName,
    recipientType:
      'USER',
    text:
      message.text,
    sentAt:
      message.createdAt.toISOString(),
  };

  this.notificationsGateway.notify(
    'message.received',
    realtimePayload,
  );

  const notification =
    await this.prisma.notification.create({
      data: {
        recipientId:
          receptionist.id,
        patientId:
          patient.id,
        type:
          'SYSTEM',
        status:
          'UNREAD',
        priority:
          'HIGH',
        title:
          'Acces patient disponibles',
        message:
          messageText,
        relatedEntity:
          'User',
        relatedId:
          patientUser.id,
      },
    });

  this.notificationsGateway.notifyToUser(
    receptionist.id,
    'notification.created',
    notification,
  );

  return {
    patientUser,
    username:
      patientUser.username,
    password:
      accountWasCreated
        ? password
        : undefined,
  };
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

  async remove(id: string, currentUser?: AuthenticatedActor) {
    const actor = await this.requireOperationalActor(currentUser);
    const actorId = actor.id;

    if (!actorId) {
      throw new ForbiddenException('Utilisateur authentifié requis.');
    }

    const verifiedActor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { clinicId: true, status: true, deletedAt: true },
    });

    if (!verifiedActor || verifiedActor.deletedAt || verifiedActor.status !== 'ACTIVE' || !verifiedActor.clinicId) {
      throw new ForbiddenException('Utilisateur actif rattaché à un établissement requis.');
    }

    const deleted = await this.prisma.patient.deleteMany({
      where: { id, clinicId: actor.clinicId, deletedAt: null },
    });

    if (!deleted.count) {
      throw new NotFoundException('Patient introuvable dans cet établissement.');
    }

    return { deleted: true };
  }

  async getPatientsAwaitingPayment(currentUser?: AuthenticatedActor) {
    const actor = await this.requireOperationalActor(currentUser);
    const actorId = actor.id;

    if (!actorId) {
      throw new ForbiddenException('Utilisateur authentifié requis.');
    }

    const verifiedActor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { clinicId: true, status: true, deletedAt: true },
    });

    if (!verifiedActor || verifiedActor.deletedAt || verifiedActor.status !== 'ACTIVE' || !verifiedActor.clinicId) {
      throw new ForbiddenException('Utilisateur actif rattaché à un établissement requis.');
    }

    const patients = await this.prisma.patient.findMany({
      where: {
        clinicId: actor.clinicId,
        deletedAt: null,
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
            clinicId: actor.clinicId,
            type: { in: ['ADMISSION_FEE', 'SERVICE', 'LABORATORY', 'PHARMACY'] },
            OR: [{ status: { in: ['PENDING', 'PARTIALLY_PAID'] } }, { balanceDue: { gt: 0 } }],
          },
          orderBy: { issuedAt: 'desc' },
          take: 5,
        },
        service: { select: { id: true, name: true } },
        receptionist: { select: { id: true, firstName: true, lastName: true, displayName: true } },
      },
      orderBy: { arrivalAt: 'desc' },
    });

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

  async getPatientsAwaitingNurseVitals(currentUser?: AuthenticatedActor) {
    const actor = await this.requireOperationalActor(currentUser);
    const actorId = actor.id;

    if (!actorId) {
      throw new ForbiddenException('Utilisateur authentifié requis.');
    }

    const verifiedActor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { clinicId: true, status: true, deletedAt: true },
    });

    if (!verifiedActor || verifiedActor.deletedAt || verifiedActor.status !== 'ACTIVE' || !verifiedActor.clinicId) {
      throw new ForbiddenException('Utilisateur actif rattaché à un établissement requis.');
    }

    const patients = await this.prisma.patient.findMany({
      where: {
        clinicId: actor.clinicId,
        deletedAt: null,
        workflowStatus: PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
      },
      include: {
        service: { select: { id: true, name: true } },
        receptionist: { select: { id: true, firstName: true, lastName: true, displayName: true } },
        vitalSigns: {
          where: { deletedAt: null },
          orderBy: { recordedAt: 'desc' },
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
        if (!acc[vital.type]) acc[vital.type] = vital.value;
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

  async getNurseOrientationHistory(
    period: 'today' | 'yesterday' | 'week' | 'all' = 'today',
    currentUser?: AuthenticatedActor,
  ) {
    const actor = await this.requireOperationalActor(currentUser);
    const actorId = actor.id;

    if (!actorId) {
      throw new ForbiddenException('Utilisateur authentifié requis.');
    }

    const verifiedActor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { clinicId: true, status: true, deletedAt: true },
    });

    if (!verifiedActor || verifiedActor.deletedAt || verifiedActor.status !== 'ACTIVE' || !verifiedActor.clinicId) {
      throw new ForbiddenException('Utilisateur actif rattaché à un établissement requis.');
    }

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
        clinicId: actor.clinicId,
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
            service: { select: { name: true } },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, displayName: true },
        },
      },
      orderBy: { eventDate: 'desc' },
      take: 50,
    });

    return history.map((item) => {
      let details: NurseOrientationDetails = {};
      try {
        const parsed: unknown = item.details ? JSON.parse(item.details) : {};
        if (this.isNurseOrientationDetails(parsed)) {
          details = parsed;
        }
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

  async recordVitalSigns(
  patientId: string,
  dto: RecordVitalSignsDto,
  recordedById?: string,
  ) {
  const recorder = await this.requireOperationalActorById(recordedById);

  if (!VITALS_ACTOR_ROLES.has(recorder.primaryRole as RoleSlug)) {
    throw new ForbiddenException(
      'Seul le personnel infirmier ou administratif autorisé peut enregistrer des signes vitaux.',
    );
  }

  const verifiedRecorder = await this.prisma.user.findUnique({
    where: { id: recorder.id },
    select: {
      clinicId: true,
      status: true,
      deletedAt: true,
    },
  });

  if (
    !verifiedRecorder ||
    verifiedRecorder.deletedAt ||
    verifiedRecorder.status !== 'ACTIVE' ||
    !verifiedRecorder.clinicId
  ) {
    throw new ForbiddenException(
      'Utilisateur actif rattaché à un établissement requis.',
    );
  }

  const patient = await this.prisma.patient.findFirst({
    where: {
      id: patientId,
      clinicId: recorder.clinicId,
      deletedAt: null,
    },
    select: {
      id: true,
      serviceId: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!patient) {
    throw new NotFoundException(
      'Patient introuvable dans cet établissement.',
    );
  }

  const rows: Array<{
    type: VitalType;
    value?: string;
    unit: string;
  }> = [
    {
      type: VitalType.TEMPERATURE,
      value: dto.temperature,
      unit: '°C',
    },
    {
      type: VitalType.BLOOD_PRESSURE,
      value: dto.bloodPressure,
      unit: 'mmHg',
    },
    {
      type: VitalType.OXYGEN_SATURATION,
      value: dto.spo2,
      unit: '%',
    },
    {
      type: VitalType.HEART_RATE,
      value: dto.heartRate,
      unit: 'bpm',
    },
    {
      type: VitalType.RESPIRATORY_RATE,
      value: dto.respiratoryRate,
      unit: '/min',
    },
    {
      type: VitalType.WEIGHT,
      value: dto.weight,
      unit: 'kg',
    },
    {
      type: VitalType.HEIGHT,
      value: dto.height,
      unit: 'cm',
    },
    {
      type: VitalType.CHEST_CIRCUMFERENCE,
      value: dto.chestCircumference,
      unit: 'cm',
    },
    {
      type: VitalType.ARM_CIRCUMFERENCE,
      value: dto.armCircumference,
      unit: 'cm',
    },
  ]
    .filter((row) => Boolean(row.value?.trim()))
    .map((row) => ({
      type: row.type,
      value: row.value!.trim(),
      unit: row.unit,
    }));

  if (rows.length === 0) {
    return this.findOneForActor(
      patientId,
      recorder.id,
    );
  }

  const result = await this.prisma.$transaction(
    async (tx) => {
      const patientInTransaction =
        await tx.patient.findFirst({
          where: {
            id: patient.id,
            clinicId: recorder.clinicId,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

      if (!patientInTransaction) {
        throw new NotFoundException(
          'Patient introuvable dans cet établissement.',
        );
      }

      await tx.vitalSign.createMany({
        data: rows.map((row) => ({
          patientId: patientInTransaction.id,
          recordedById: recorder.id,
          type: row.type,
          value: row.value,
          unit: row.unit,
          note: dto.notes?.trim() || null,
        })),
      });

      let consultation = null;

      let workflowStatus: PatientWorkflowStatus =
        PatientWorkflowStatus.EN_ATTENTE_MEDECIN;

      if (dto.physicianId) {
        const physician = await tx.user.findFirst({
          where: {
            id: dto.physicianId,
            clinicId: recorder.clinicId,
            status: 'ACTIVE',
            deletedAt: null,
            OR: [
              {
                primaryRole: RoleSlug.PHYSICIAN,
              },
              {
                roles: {
                  some: {
                    role: {
                      slug: RoleSlug.PHYSICIAN,
                    },
                  },
                },
              },
            ],
          },
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        });

        if (!physician) {
          throw new ForbiddenException(
            'Le médecin sélectionné est introuvable ou appartient à un autre établissement.',
          );
        }

        const physicianName =
          physician.displayName ||
          [physician.firstName, physician.lastName]
            .filter(Boolean)
            .join(' ') ||
          physician.username;

        const appointment =
          await tx.appointment.create({
            data: {
              patientId: patientInTransaction.id,
              requestedById: recorder.id,
              clinicId: recorder.clinicId,
              scheduledAt: new Date(),
              reason:
                `Orientation apres signes vitaux${
                  dto.notes
                    ? ` - ${dto.notes.trim()}`
                    : ''
                }`,
              status: 'CHECKED_IN',
              durationMinutes: 30,
            },
          });

        consultation =
          await tx.consultation.create({
            data: {
              patientId: patientInTransaction.id,
              appointmentId: appointment.id,
              providerId: physician.id,
              clinicId: recorder.clinicId,
              status: 'DRAFT',
              chiefComplaint:
                'Patient oriente par l infirmier apres prise des signes vitaux',
              clinicalSummary:
                dto.notes?.trim() || null,
            },
          });

        await tx.medicalHistory.create({
          data: {
            patientId: patientInTransaction.id,
            eventDate: new Date(),
            kind: 'NURSE_ORIENTATION',
            details: JSON.stringify({
              physicianId: physician.id,
              physicianName,
              recordedById: recorder.id,
              appointmentId: appointment.id,
              consultationId: consultation.id,
              notes: dto.notes || null,
            }),
            createdById: recorder.id,
          },
        });

        workflowStatus =
          PatientWorkflowStatus.EN_CONSULTATION;
      }

      // AC-P002:
      // la mutation elle-même reste strictement limitée
      // au tenant authentifié et à un patient non supprimé.
      await tx.patient.update({
        where: {
          id: patientInTransaction.id,
          clinicId: recorder.clinicId,
          deletedAt: null,
        },
        data: {
          workflowStatus,
        },
      });

      return consultation;
    },
  );

  this.notificationsGateway.notify(
    'patient.updated',
    {
      id: patient.id,
      workflowStatus: result
        ? PatientWorkflowStatus.EN_CONSULTATION
        : PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
    },
  );

  if (result) {
    this.notificationsGateway.notify(
      'consultation.created',
      result,
    );
  }

  return this.findOneForActor(
    patient.id,
    recorder.id,
  );
  }

  async getPatientsAssignedToDoctor(doctorId?: string) {
    const doctor = await this.requireOperationalActorById(doctorId);
    if (doctor.primaryRole !== RoleSlug.PHYSICIAN) {
      throw new ForbiddenException('Ce parcours est réservé au médecin authentifié.');
    }

    const verifiedDoctor = await this.prisma.user.findUnique({
      where: {
        id: doctor.id,
      },
      select: {
        clinicId: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      !verifiedDoctor ||
      verifiedDoctor.deletedAt ||
      verifiedDoctor.status !== 'ACTIVE' ||
      !verifiedDoctor.clinicId
    ) {
      throw new ForbiddenException(
        'Médecin actif rattaché à un établissement requis.',
      );
    }

    const visibleLabRequestsWhere =
      this.getVisibleLabRequestsWhere();

    const patients = await this.prisma.patient.findMany({
      where: {
        clinicId: doctor.clinicId,
        deletedAt: null,
        consultations: {
          some: {
            providerId: doctor.id,
            deletedAt: null,
          },
        },
      },

      include: {
        service: {
          select: {
            id: true,
            name: true,
          },
        },

        vitalSigns: {
          orderBy: {
            recordedAt: 'desc',
          },
          take: 10,
        },

        consultations: {
          where: {
            providerId: doctor.id,
            deletedAt: null,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
          include: {
            appointment: true,
            prescriptions: {
              include: {
                lineItems: true,
              },
            },
          },
        },

        labRequests: {
          where: visibleLabRequestsWhere,
          orderBy: {
            requestedAt: 'desc',
          },
          take: 5,
          include: {
            results: true,
          },
        },

        imagingRequests: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
          include: {
            report: true,
          },
        },

        prescriptions: {
          orderBy: {
            prescribingDate: 'desc',
          },
          take: 5,
          include: {
            lineItems: true,
          },
        },

        appointments: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            scheduledAt: 'desc',
          },
          take: 10,
        },
      },

      orderBy: [
        {
          updatedAt: 'desc',
        },
      ],
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
      latestConsultation:
        patient.consultations[0] || null,
      hasPendingAppointmentWithoutConsultation:
        patient.appointments.some(
          (appt) => appt.status !== 'CANCELLED',
        ) &&
        patient.consultations.length === 0,
    }));
  }

  async getPatientsVisibleToDoctors(
    doctorId?: string,
    requestedPage?: number,
    requestedLimit?: number,
  ) {
    const doctor = await this.requireOperationalActorById(doctorId);
    if (doctor.primaryRole !== RoleSlug.PHYSICIAN) {
      throw new ForbiddenException('Ce parcours est réservé au médecin authentifié.');
    }

    const verifiedDoctor = await this.prisma.user.findUnique({
      where: {
        id: doctor.id,
      },
      select: {
        clinicId: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      !verifiedDoctor ||
      verifiedDoctor.deletedAt ||
      verifiedDoctor.status !== 'ACTIVE' ||
      !verifiedDoctor.clinicId
    ) {
      throw new ForbiddenException(
        'Médecin actif rattaché à un établissement requis.',
      );
    }

    const page =
      Number.isFinite(requestedPage) &&
      requestedPage! > 0
        ? Math.floor(requestedPage!)
        : 1;

    const limit =
      Number.isFinite(requestedLimit) &&
      requestedLimit! > 0
        ? Math.min(
            Math.floor(requestedLimit!),
            25,
          )
        : 10;

    const paginate =
      Number.isFinite(requestedPage) ||
      Number.isFinite(requestedLimit);

    const where: Prisma.PatientWhereInput = {
      deletedAt: null,
      clinicId: doctor.clinicId,

      OR: [
        {
          consultations: {
            some: {
              providerId: doctor.id,
              deletedAt: null,
            },
          },
        },
        {
          hospitalizations: {
            some: {
              physicianId: doctor.id,
              deletedAt: null,
            },
          },
        },
        {
          workflowStatus:
            PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
        },
      ],
    };

    const [patients, total] =
      await this.prisma.$transaction([
        this.prisma.patient.findMany({
          where,

          include: {
            service: true,

            familyContacts: true,

            vitalSigns: {
              orderBy: {
                recordedAt: 'desc',
              },
              take: 20,
              include: {
                recordedBy: {
                  select: {
                    id: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },

            medicalHistories: {
              orderBy: {
                eventDate: 'desc',
              },
              take: 20,
              include: {
                createdBy: {
                  select: {
                    id: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    primaryRole: true,
                  },
                },
              },
            },

            consultations: {
              where: {
                deletedAt: null,
              },
              orderBy: {
                createdAt: 'desc',
              },

              // The doctor UI paginates this list client-side
              // (3 cards at a time).
              // Keep a practical recent window without silently
              // hiding the 11th+ visit.
              take: 50,

              include: {
                provider: {
                  select: {
                    id: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    specialty: true,
                  },
                },

                prescriptions: {
                  include: {
                    lineItems: {
                      include: {
                        medication: true,
                      },
                    },
                  },
                },

                labRequests: {
                  where:
                    this.getVisibleLabRequestsWhere(),
                  include: {
                    results: true,
                    requestedBy: true,
                  },
                },

                imagingRequests: {
                  include: {
                    report: true,
                  },
                },
              },
            },

            labRequests: {
              where:
                this.getVisibleLabRequestsWhere(),
              orderBy: {
                requestedAt: 'desc',
              },
              take: 10,
              include: {
                results: {
                  include: {
                    parameters: {
                      include: {
                        labTestParameter: true,
                      },
                    },
                  },
                },
                requestedBy: true,
              },
            },

            imagingRequests: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 10,
              include: {
                report: true,
                requestedBy: true,
              },
            },

            prescriptions: {
              orderBy: {
                prescribingDate: 'desc',
              },
              take: 10,
              include: {
                lineItems: {
                  include: {
                    medication: true,
                  },
                },
                prescriber: true,
              },
            },

            hospitalizations: {
              orderBy: {
                admittedAt: 'desc',
              },
              take: 5,
              include: {
                physician: true,
                nurseInCharge: true,
              },
            },

            appointments: {
              where: {
                deletedAt: null,
              },
              orderBy: {
                scheduledAt: 'desc',
              },
              take: 10,
            },
          },

          orderBy: {
            updatedAt: 'desc',
          },

          skip:
            (page - 1) * limit,

          take:
            limit,
        }),

        this.prisma.patient.count({
          where,
        }),
      ]);

    const accessByConsultationId =
      await Promise.all(
        patients.map(async (patient) => {
          const latestConsultation =
            patient.consultations[0] || null;

          const canWrite =
            latestConsultation
              ? await this.canDoctorWriteConsultation(
                  latestConsultation.providerId,
                  doctor.id,
                  doctor.clinicId,
                )
              : false;

          return [
            patient.id,
            {
              latestConsultation,
              canWrite,
            },
          ] as const;
        }),
      );

    const accessMap =
      new Map(accessByConsultationId);

    const items = patients.map((patient) => {
      const access =
        accessMap.get(patient.id);

      const latestConsultation =
        access?.latestConsultation || null;

      const assignedDoctor =
        latestConsultation?.provider || null;

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
        workflowStatus:
          patient.workflowStatus,
        priority: patient.priority,
        admissionType:
          patient.admissionType,
        arrivalAt: patient.arrivalAt,
        service: patient.service,
        familyContacts:
          patient.familyContacts,
        vitalSigns:
          patient.vitalSigns,
        medicalHistories:
          patient.medicalHistories,
        consultations:
          patient.consultations,
        labRequests:
          patient.labRequests,
        imagingRequests:
          patient.imagingRequests,
        prescriptions:
          patient.prescriptions,
        hospitalizations:
          patient.hospitalizations,
        latestConsultation,
        assignedDoctor,

        access: {
          mode:
            access?.canWrite
              ? 'WRITE'
              : 'READ_ONLY',

          canWrite:
            Boolean(access?.canWrite),

          reason:
            access?.canWrite
              ? latestConsultation?.providerId ===
                doctor.id
                ? 'MEDECIN_ASSIGNE'
                : 'REMPLACEMENT_SHIFT_ACTIF'
              : 'LECTURE_MEDICALE_PARTAGEE',
        },
      };
    });

    return paginate
      ? {
          items,
          total,
          page,
          limit,
          totalPages: Math.max(
            1,
            Math.ceil(total / limit),
          ),
        }
      : items;
  }

  async canDoctorWriteConsultation(
    assignedDoctorId?: string | null,
    doctorId?: string | null,
    clinicId?: string | null,
  ) {
    if (!assignedDoctorId || !doctorId || !clinicId) return false;
    if (assignedDoctorId === doctorId) return true;

    const now = new Date();
    const [assignedActiveShift, replacementActiveShift] = await Promise.all([
      this.prisma.shift.findFirst({
        where: {
          employee: { userId: assignedDoctorId, clinicId, status: 'ACTIVE' },
          startAt: { lte: now },
          endAt: { gte: now },
        },
      }),
      this.prisma.shift.findFirst({
        where: {
          employee: { userId: doctorId, clinicId, status: 'ACTIVE' },
          startAt: { lte: now },
          endAt: { gte: now },
        },
      }),
    ]);

    return !assignedActiveShift && Boolean(replacementActiveShift);
  }
}
