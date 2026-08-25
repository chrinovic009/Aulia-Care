import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PatientWorkflowStatus, RoleSlug } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalize(value?: string | null) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /** Limited, clinic-scoped directory used for the nurse's vital-sign routing. */
  async findAvailablePhysicians(actorId?: string) {
    const actor = actorId
      ? await this.prisma.user.findUnique({ where: { id: actorId }, select: { clinicId: true } })
      : null;

    return this.prisma.user.findMany({
      where: {
        primaryRole: RoleSlug.PHYSICIAN,
        status: 'ACTIVE',
        deletedAt: null,
        ...(actor?.clinicId ? { clinicId: actor.clinicId } : {}),
      },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        specialty: true,
      },
      orderBy: [{ displayName: 'asc' }, { lastName: 'asc' }],
    });
  }

  private async resolvePrimaryRole(dto: {
    primaryRole?: RoleSlug | null;
    departmentId?: string | null;
    isResponsible?: boolean;
    isDepartmentResponsible?: boolean;
  }) {
    if (!dto.departmentId) return dto.primaryRole;

    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
      select: { name: true },
    });
    if (!department) {
      throw new BadRequestException('Departement introuvable.');
    }

    const isLaboratory = this.normalize(department.name) === 'laboratoire';
    if (!isLaboratory) return dto.primaryRole || RoleSlug.NURSE;

    return dto.isResponsible || dto.isDepartmentResponsible ? RoleSlug.LAB_MANAGER : RoleSlug.LAB_TECHNICIAN;
  }

  private makeInitialStaffPassword(clinicName: string, role: RoleSlug, firstName: string, lastName: string, position: number) {
    const establishmentPrefix = String(clinicName || 'Aulia Care')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase()
      .padEnd(2, 'A');
    const roleLetter = String(role || 'USER').charAt(0).toUpperCase() || 'U';
    const initials = `${String(firstName || 'X').charAt(0)}${String(lastName || 'X').charAt(0)}`.toUpperCase();
    return `${establishmentPrefix}${roleLetter}-${initials}${position}${new Date().getFullYear()}`;
  }

  private validateEmployeeSchedule(input: { shiftPattern?: string; rotationAnchorAt?: string; rotationDays?: number; permanentShiftEndTime?: string }) {
    if (input.rotationDays !== undefined && (!Number.isInteger(input.rotationDays) || Number(input.rotationDays) < 1 || Number(input.rotationDays) > 31)) {
      throw new BadRequestException('Le nombre de jours par phase doit être compris entre 1 et 31.');
    }
    if (input.shiftPattern === 'THREE_DAY_THREE_NIGHT_THREE_REST') {
      if (!input.rotationAnchorAt) throw new BadRequestException('La date du premier jour de rotation est obligatoire.');
      if (input.rotationDays === undefined) {
        throw new BadRequestException('Le nombre de jours par phase doit être compris entre 1 et 31.');
      }
    }
    if (input.shiftPattern === 'PERMANENT_DAY' && input.permanentShiftEndTime) {
      if (input.permanentShiftEndTime <= '07:30') {
        throw new BadRequestException('La sortie de permanence doit être postérieure à 07:30.');
      }
    }
  }

  private validateEmployeeIdentity(input: { phone?: string; dateOfBirth?: string }) {
    if (input.dateOfBirth) {
      const birth = new Date(`${input.dateOfBirth.slice(0, 10)}T00:00:00.000Z`);
      if (Number.isNaN(birth.getTime()) || birth > new Date()) throw new BadRequestException('La date de naissance est invalide.');
      const today = new Date();
      let age = today.getUTCFullYear() - birth.getUTCFullYear();
      const beforeBirthday = today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
      if (beforeBirthday) age -= 1;
      if (age < 18) throw new BadRequestException('Un employé doit être âgé d’au moins 18 ans.');
    }
    if (input.phone) {
      const compact = input.phone.replace(/\s/g, '');
      if (!/^\+[1-9]\d{7,14}$/.test(compact)) throw new BadRequestException('Le téléphone doit être au format international, par exemple +243…');
      const rdc = compact.startsWith('+243') ? compact.slice(4) : null;
      if (rdc && (!/^\d{9}$/.test(rdc) || !['81', '82', '83', '84', '85', '89', '90', '91', '97', '98', '99'].includes(rdc.slice(0, 2)))) {
        throw new BadRequestException('Le numéro RDC doit contenir 9 chiffres et un préfixe mobile reconnu.');
      }
    }
  }

  async create(dto: CreateUserDto, creatorId?: string) {
    if (dto.primaryRole === RoleSlug.DEV) {
      throw new BadRequestException('Le rôle DEV ne peut être créé que par le provisionnement local sécurisé.');
    }
    this.validateEmployeeSchedule(dto);
    this.validateEmployeeIdentity(dto);
    const primaryRole = await this.resolvePrimaryRole(dto);
    const creator = creatorId
      ? await this.prisma.user.findUnique({ where: { id: creatorId }, select: { clinicId: true } })
      : null;
    const clinic = creator?.clinicId
      ? await this.prisma.clinic.findUnique({ where: { id: creator.clinicId }, select: { name: true, brandDisplayName: true } })
      : null;
    const position = await this.prisma.user.count({
      where: { deletedAt: null, primaryRole, ...(creator?.clinicId ? { clinicId: creator.clinicId } : {}) },
    }) + 1;
    const generatedPassword = dto.password ? undefined : this.makeInitialStaffPassword(clinic?.brandDisplayName || clinic?.name || 'Aulia Care', primaryRole || RoleSlug.NURSE, dto.firstName, dto.lastName, position);
    const passwordHash = await bcrypt.hash(dto.password || generatedPassword!, 10);
    const employeeDetails = {
      gender: dto.gender ?? null,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      position: dto.position ?? primaryRole,
      employeeNumber: dto.employeeNumber ?? null,
      departmentId: dto.departmentId ?? null,
      serviceUnitId: dto.serviceUnitId ?? null,
      shiftPattern: dto.shiftPattern ?? 'MANUAL',
      rotationAnchorAt: dto.rotationAnchorAt ? new Date(dto.rotationAnchorAt) : null,
      // The rota is evaluated at access time; explicit Shift rows remain exceptional overrides.
      rotationDays: dto.rotationDays ?? 3,
      permanentShiftEndTime: dto.permanentShiftEndTime ?? '17:30',
    };

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          username: dto.username.toLowerCase(),
          displayName: dto.displayName,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          primaryRole,
          clinicId: creator?.clinicId ?? null,

          specialty: dto.specialty ?? null,
          phone: dto.phone ?? null,
          whatsappUrl: dto.whatsappUrl ?? null,
          facebookUrl: dto.facebookUrl ?? null,
          instagramUrl: dto.instagramUrl ?? null,
          linkedinUrl: dto.linkedinUrl ?? null,

          nationality: dto.nationality ?? null,
          addressCountry: dto.addressCountry ?? null,
          addressProvince: dto.addressProvince ?? null,
          addressCity: dto.addressCity ?? null,
          addressNeighborhood: dto.addressNeighborhood ?? null,
          addressStreet: dto.addressStreet ?? null,

          bio: dto.bio ?? null,

          status: dto.status ?? 'ACTIVE',
          Employee: {
            create: {
              firstName: dto.firstName,
              lastName: dto.lastName,
              hireDate: new Date(),
              status: 'ACTIVE',
              ...employeeDetails,
              contracts:
                dto.salary || dto.contractType || dto.salaryFrequency
                  ? {
                      create: {
                        type: (dto.contractType as any) ?? 'PERMANENT',
                        startDate: new Date(),
                        salary: dto.salary ?? null,
                        frequency: dto.salaryFrequency ?? 'MONTHLY',
                      },
                    }
                  : undefined,
              shifts:
                dto.shiftStartAt && dto.shiftEndAt
                  ? {
                      create: {
                        startAt: new Date(dto.shiftStartAt),
                        endAt: new Date(dto.shiftEndAt),
                        type: (dto.shiftType as any) ?? 'DAY',
                      },
                    }
                  : undefined,
            },
          },
        },
        include: {
          Employee: {
            include: {
              department: true,
              serviceUnit: true,
              contracts: { where: { active: true }, orderBy: { createdAt: 'desc' }, take: 1 },
              shifts: { orderBy: { startAt: 'desc' }, take: 5 },
            },
          },
          staff: { include: { service: true } },
          serviceResponsabilites: { include: { service: true } },
          // CORRIGÉ : "ties" au lieu de "tes"
          departmentResponsibilities: { include: { department: true } },
        },
      });
      return generatedPassword ? { ...user, generatedPassword } : user;
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
        if (target.includes('username')) {
          throw new BadRequestException('Le nom d\'utilisateur existe déjà. Choisissez-en un autre.');
        }
        if (target.includes('email')) {
          throw new BadRequestException('L\'email existe déjà. Choisissez-en un autre.');
        }
      }
      throw error;
    }
  }

  findAll() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        firstName: true,
        lastName: true,
        primaryRole: true,
        specialty: true,
        profilePhotoUrl: true,
        phone: true,
        nationality: true,
        addressCountry: true,
        addressProvince: true,
        addressCity: true,
        addressNeighborhood: true,
        addressStreet: true,
        bio: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        Employee: {
          include: {
            department: true,
            serviceUnit: true,
            contracts: { where: { active: true }, orderBy: { createdAt: 'desc' }, take: 1 },
            shifts: { orderBy: { startAt: 'desc' }, take: 5 },
          },
        },
        staff: {
          where: { actif: true },
          include: { service: true },
        },
        serviceResponsabilites: {
          where: { actif: true },
          include: { service: true },
        },
        // CORRIGÉ : "ties" au lieu de "tes"
        departmentResponsibilities: {
          where: { actif: true },
          include: { department: true },
        },
      },
      orderBy: [{ primaryRole: 'asc' }, { displayName: 'asc' }],
    });
  }

  async findContactsForRole(role?: RoleSlug | 'PATIENT', userId?: string) {
    if (role === 'PATIENT') {
      return this.decorateContactsByActivity(userId, await this.findPatientCareTeamContacts(userId));
    }
    type ContactRole = RoleSlug | 'PATIENT';
    const staffRoles: RoleSlug[] = [
      RoleSlug.RECEPTIONIST,
      RoleSlug.NURSE,
      RoleSlug.PHYSICIAN,
      RoleSlug.LAB_MANAGER,
      RoleSlug.LAB_TECHNICIAN,
      RoleSlug.RADIOLOGIST,
      RoleSlug.PHARMACIST,
      RoleSlug.CASHIER,
      RoleSlug.FINANCE,
    ];
    const allowedRolesByRole: Partial<Record<RoleSlug | 'PATIENT', ContactRole[]>> = {
      // Administrative accounts do not directly message patients; clinical roles
      // remain the designated communication channel.
      SUPER_ADMIN: ['ADMIN'],

      // Admin can contact staff, but not patients.
      ADMIN: [
        'SUPER_ADMIN',
        'RECEPTIONIST',
        'NURSE',
        'PHYSICIAN',
        'LAB_MANAGER',
        'LAB_TECHNICIAN',
        'RADIOLOGIST',
        'PHARMACIST',
        'CASHIER',
        'FINANCE',
      ],
      // All operational staff can collaborate with every other operational staff.
      RECEPTIONIST: staffRoles,
      NURSE: staffRoles,
      PHYSICIAN: staffRoles,
      LAB_TECHNICIAN: staffRoles,
      LAB_MANAGER: staffRoles,
      RADIOLOGIST: staffRoles,
      PHARMACIST: staffRoles,
      CASHIER: staffRoles,
      // Finance collaborates with all staff and both administration levels,
      // while patient conversations remain restricted to the care pathway.
      FINANCE: [...staffRoles, RoleSlug.ADMIN, RoleSlug.SUPER_ADMIN],
      PATIENT: ['RECEPTIONIST', 'NURSE', 'PHYSICIAN', 'CASHIER'],
    };

    const allowedRoles = role ? allowedRolesByRole[role] || [] : [];
    const permittedStaffRoles = allowedRoles.filter((allowedRole): allowedRole is RoleSlug => allowedRole !== 'PATIENT');
    const includePatients = allowedRoles.includes('PATIENT');

    const staff = permittedStaffRoles.length
      ? await this.prisma.user.findMany({
          where: {
            deletedAt: null,
            status: 'ACTIVE',
            primaryRole: { in: permittedStaffRoles },
            ...(userId ? { id: { not: userId } } : {}),
          },
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            primaryRole: true,
            specialty: true,
            phone: true,
            email: true,
          },
          orderBy: [{ primaryRole: 'asc' }, { displayName: 'asc' }],
        })
      : [];

    const patients = includePatients
      ? await this.prisma.patient.findMany({
          where: {
            deletedAt: null,
            ...(role === 'NURSE'
              ? {
                  OR: [
                    { workflowStatus: PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE },
                    {
                      priority: {
                        in: ['URGENT', 'URGENCE', 'HIGH', 'HAUTE', 'CRITICAL', 'CRITIQUE', 'PRIORITAIRE'],
                        mode: 'insensitive',
                      },
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            phone: true,
            email: true,
            workflowStatus: true,
            priority: true,
          },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          take: 100,
        })
      : [];

    const patientUsersByEmail = new Map(
      includePatients
        ? (
            await this.prisma.user.findMany({
              where: {
                deletedAt: null,
                status: 'ACTIVE',
                email: {
                  in: patients.map((patient) => patient.email).filter((email): email is string => Boolean(email)),
                },
              },
              select: { id: true, email: true },
            })
          ).map((user) => [user.email.toLowerCase(), user.id])
        : [],
    );

    let contacts = [
      ...staff.map((user) => ({
        id: user.id,
        type: 'USER',
        name: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
        role: user.primaryRole,
        subtitle: user.specialty || this.labelRole(user.primaryRole),
        phone: user.phone,
        email: user.email,
      })),
      ...patients.filter((patient) => Boolean(patient.email && patientUsersByEmail.get(patient.email.toLowerCase()))).map((patient) => ({
        id: patientUsersByEmail.get(patient.email!.toLowerCase())!,
        patientId: patient.id,
        type: 'PATIENT',
        name: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' '),
        role: 'PATIENT',
        subtitle: patient.priority ? `Cas ${patient.priority}` : patient.workflowStatus,
        phone: patient.phone,
        email: patient.email,
      })),
    ];
    if (userId && role && !['ADMIN', 'SUPER_ADMIN'].includes(String(role))) {
      const carePatients = await this.findPatientsForStaffContact(userId, role);
      contacts = [...contacts, ...carePatients.filter((candidate) => !contacts.some((contact) => contact.id === candidate.id))];
    }
    return this.decorateContactsByActivity(userId, contacts);
  }

  private async findPatientsForStaffContact(userId: string, role: RoleSlug) {
    const whereByRole: Record<string, any> = {
      RECEPTIONIST: { receptionistId: userId },
      PHYSICIAN: { OR: [{ consultations: { some: { providerId: userId } } }, { hospitalizations: { some: { physicianId: userId } } }] },
      NURSE: { OR: [{ hospitalizations: { some: { nurseInChargeId: userId } } }, { hospitalizations: { some: { nurseAssignments: { some: { nurseId: userId, releasedAt: null } } } } }] },
      CASHIER: { invoices: { some: { payments: { some: { paidById: userId } } } } },
      LAB_MANAGER: { labRequests: { some: {} } },
      LAB_TECHNICIAN: { labRequests: { some: { items: { some: { assignedToId: userId } } } } },
      RADIOLOGIST: { imagingRequests: { some: {} } },
    };
    const relation = whereByRole[String(role)];
    if (!relation) return [];
    const patients = await this.prisma.patient.findMany({
      where: { deletedAt: null, ...relation },
      select: { id: true, firstName: true, middleName: true, lastName: true, email: true, phone: true, workflowStatus: true, priority: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const emails = patients.map((patient) => patient.email).filter((email): email is string => Boolean(email));
    if (!emails.length) return [];
    const patientUsers = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE', primaryRole: RoleSlug.PATIENT, email: { in: emails } },
      select: { id: true, email: true },
    });
    const accountByEmail = new Map(patientUsers.map((account) => [account.email.toLowerCase(), account.id]));
    return patients
      .filter((patient) => Boolean(patient.email && accountByEmail.get(patient.email.toLowerCase())))
      .map((patient) => ({
        id: accountByEmail.get(patient.email!.toLowerCase())!,
        patientId: patient.id,
        type: 'PATIENT' as const,
        name: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' '),
        role: 'PATIENT',
        subtitle: patient.priority ? `Suivi ${patient.priority}` : 'Patient suivi',
        phone: patient.phone,
        email: patient.email,
      }));
  }

  async isDirectMessagingAllowed(senderId: string, recipientId: string) {
    const [sender, recipient] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: senderId }, select: { primaryRole: true } }),
      this.prisma.user.findUnique({ where: { id: recipientId }, select: { primaryRole: true } }),
    ]);
    if (!sender || !recipient || senderId === recipientId) return false;
    const senderRole = String(sender.primaryRole || '');
    const recipientRole = String(recipient.primaryRole || '');

    // The platform owner has a deliberately narrow channel: only the local admin.
    if (senderRole === 'SUPER_ADMIN') return recipientRole === 'ADMIN';
    if (recipientRole === 'SUPER_ADMIN') return senderRole === 'ADMIN';
    // Local administration may collaborate with staff but never with patient accounts.
    if (senderRole === 'ADMIN') return recipientRole !== 'PATIENT';
    if (recipientRole === 'ADMIN') return senderRole !== 'PATIENT';

    if (senderRole === 'PATIENT' || recipientRole === 'PATIENT') {
      const patientUserId = senderRole === 'PATIENT' ? senderId : recipientId;
      const staffUserId = senderRole === 'PATIENT' ? recipientId : senderId;
      const careTeam = await this.findPatientCareTeamContacts(patientUserId);
      return careTeam.some((contact) => contact.id === staffUserId);
    }
    // Operational staff may coordinate directly with any other operational staff.
    return true;
  }

  private async decorateContactsByActivity<T extends { id: string }>(userId: string | undefined, contacts: T[]) {
    if (!userId || contacts.length === 0) return contacts;
    const contactIds = [...new Set(contacts.map((contact) => contact.id).filter((id) => id !== userId))];
    if (!contactIds.length) return contacts;
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        OR: [
          { senderId: userId, recipientId: { in: contactIds } },
          { senderId: { in: contactIds }, recipientId: userId },
        ],
      },
      select: { senderId: true, recipientId: true, text: true, createdAt: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const summaries = new Map<string, { lastMessageAt?: Date; lastMessagePreview?: string; unreadCount: number }>();
    for (const message of messages) {
      const contactId = message.senderId === userId ? message.recipientId : message.senderId;
      const summary = summaries.get(contactId) || { unreadCount: 0 };
      if (!summary.lastMessageAt) {
        summary.lastMessageAt = message.createdAt;
        summary.lastMessagePreview = message.text.slice(0, 120);
      }
      if (message.recipientId === userId && message.status !== 'READ') summary.unreadCount += 1;
      summaries.set(contactId, summary);
    }
    return contacts
      .map((contact) => ({ ...contact, ...(summaries.get(contact.id) || { unreadCount: 0 }) }))
      .sort((left, right) => Number(new Date((right as any).lastMessageAt || 0)) - Number(new Date((left as any).lastMessageAt || 0)) || 0);
  }

  private async findPatientCareTeamContacts(userId?: string) {
    if (!userId) return [];
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, firstName: true, lastName: true },
    });
    if (!account) return [];
    const patient = await this.prisma.patient.findFirst({
      where: {
        deletedAt: null,
        OR: [
          account.email ? { email: account.email } : undefined,
          account.phone ? { phone: account.phone } : undefined,
          { firstName: { equals: account.firstName, mode: 'insensitive' }, lastName: { equals: account.lastName, mode: 'insensitive' } },
        ].filter(Boolean) as any,
      },
      select: {
        receptionistId: true,
        consultations: { select: { providerId: true } },
        hospitalizations: {
          where: { deletedAt: null },
          select: {
            physicianId: true,
            nurseInChargeId: true,
            nurseAssignments: { where: { releasedAt: null }, select: { nurseId: true } },
          },
        },
        labRequests: { where: { deletedAt: null }, select: { id: true } },
        imagingRequests: { where: { deletedAt: null }, select: { id: true } },
        invoices: { where: { deletedAt: null }, select: { issuedById: true, payments: { select: { paidById: true } } } },
      },
    });
    if (!patient) return [];
    const contactIds = new Set<string>();
    if (patient.receptionistId) contactIds.add(patient.receptionistId);
    patient.consultations.forEach((item) => item.providerId && contactIds.add(item.providerId));
    patient.hospitalizations.forEach((stay) => {
      if (stay.physicianId) contactIds.add(stay.physicianId);
      if (stay.nurseInChargeId) contactIds.add(stay.nurseInChargeId);
      stay.nurseAssignments.forEach((assignment) => contactIds.add(assignment.nurseId));
    });
    patient.invoices.forEach((invoice) => {
      if (invoice.issuedById) contactIds.add(invoice.issuedById);
      invoice.payments.forEach((payment) => payment.paidById && contactIds.add(payment.paidById));
    });
    const conditionalRoles: RoleSlug[] = [];
    if (patient.labRequests.length) conditionalRoles.push(RoleSlug.LAB_MANAGER);
    if (patient.imagingRequests.length) conditionalRoles.push(RoleSlug.RADIOLOGIST);
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        id: { not: userId },
        OR: [
          ...(contactIds.size ? [{ id: { in: [...contactIds] } }] : []),
          ...(conditionalRoles.length ? [{ primaryRole: { in: conditionalRoles } }] : []),
        ],
      },
      select: { id: true, displayName: true, firstName: true, lastName: true, primaryRole: true, specialty: true, phone: true, email: true },
      orderBy: [{ primaryRole: 'asc' }, { displayName: 'asc' }],
    });
    return users.map((user) => ({
      id: user.id,
      type: 'USER' as const,
      name: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
      role: user.primaryRole || 'USER',
      subtitle: user.specialty || this.labelRole(user.primaryRole),
      phone: user.phone,
      email: user.email,
    }));
  }

  private labelRole(role?: RoleSlug | 'PATIENT' | null) {
    const labels: Partial<Record<RoleSlug | 'PATIENT', string>> = {
      RECEPTIONIST: 'Reception',
      NURSE: 'Infirmier',
      PHYSICIAN: 'Medecin',
      LAB_TECHNICIAN: 'Laboratoire',
      LAB_MANAGER: 'Responsable laboratoire',
      RADIOLOGIST: 'Radiologie',
      PHARMACIST: 'Pharmacie',
      CASHIER: 'Caisse',
      FINANCE: 'Finance',
      PATIENT: 'Patient',
      ADMIN: 'Administration',
      SUPER_ADMIN: 'Administration',
    };

    return role ? labels[role] || role : 'Contact';
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    if (dto.primaryRole === RoleSlug.DEV) {
      throw new BadRequestException('Le rôle DEV ne peut pas être attribué depuis l’administration.');
    }
    this.validateEmployeeSchedule(dto);
    this.validateEmployeeIdentity(dto);
    const data: any = { ...dto };
    const employeeData: any = {};
    const contractData: any = {};

    if (dto.departmentId !== undefined || dto.primaryRole !== undefined || dto.isResponsible !== undefined || dto.isDepartmentResponsible !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: { primaryRole: true, Employee: { select: { departmentId: true }, take: 1 } },
      });
      data.primaryRole = await this.resolvePrimaryRole({
        primaryRole: dto.primaryRole || existing?.primaryRole || RoleSlug.NURSE,
        departmentId: dto.departmentId !== undefined ? dto.departmentId || undefined : existing?.Employee?.[0]?.departmentId,
        isResponsible: dto.isResponsible,
        isDepartmentResponsible: dto.isDepartmentResponsible,
      });
    }

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }

    for (const key of [
      'gender',
      'dateOfBirth',
      'position',
      'employeeNumber',
      'departmentId',
      'serviceUnitId',
      'isResponsible',
      'isDepartmentResponsible',
      'contractType',
      'salary',
      'salaryFrequency',
      'shiftStartAt',
      'shiftEndAt',
      'shiftType',
      'shiftPattern',
      'rotationAnchorAt',
      'rotationDays',
      'permanentShiftEndTime',
    ]) {
      delete data[key];
    }

    if (dto.gender !== undefined) employeeData.gender = dto.gender;
    if (dto.dateOfBirth !== undefined) employeeData.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.position !== undefined) employeeData.position = dto.position;
    if (dto.employeeNumber !== undefined) employeeData.employeeNumber = dto.employeeNumber;
    if (dto.departmentId !== undefined) employeeData.departmentId = dto.departmentId || null;
    if (dto.serviceUnitId !== undefined) employeeData.serviceUnitId = dto.serviceUnitId || null;
    if (dto.shiftPattern !== undefined) employeeData.shiftPattern = dto.shiftPattern;
    if (dto.rotationAnchorAt !== undefined) employeeData.rotationAnchorAt = dto.rotationAnchorAt ? new Date(dto.rotationAnchorAt) : null;
    if (dto.rotationDays !== undefined) employeeData.rotationDays = dto.rotationDays;
    if (dto.permanentShiftEndTime !== undefined) employeeData.permanentShiftEndTime = dto.permanentShiftEndTime;
    if (dto.salary !== undefined) contractData.salary = dto.salary;
    if (dto.salaryFrequency !== undefined) contractData.frequency = dto.salaryFrequency;
    if (dto.contractType !== undefined) contractData.type = dto.contractType as any;

    if (data.email) data.email = data.email.toLowerCase();
    if (data.username) data.username = data.username.toLowerCase();

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { Employee: { include: { contracts: { where: { active: true }, take: 1 } } } },
    });

    if (Object.keys(employeeData).length || Object.keys(contractData).length) {
      const employee = user.Employee[0]
        ? await this.prisma.employee.update({
            where: { id: user.Employee[0].id },
            data: {
              ...employeeData,
              firstName: data.firstName ?? user.firstName,
              lastName: data.lastName ?? user.lastName,
            },
          })
        : await this.prisma.employee.create({
            data: {
              userId: id,
              firstName: data.firstName ?? user.firstName,
              lastName: data.lastName ?? user.lastName,
              hireDate: new Date(),
              ...employeeData,
            },
          });

      if (Object.keys(contractData).length) {
        const activeContract = user.Employee[0]?.contracts?.[0];
        if (activeContract) {
          await this.prisma.employeeContract.update({ where: { id: activeContract.id }, data: contractData });
        } else {
          await this.prisma.employeeContract.create({
            data: {
              employeeId: employee.id,
              startDate: new Date(),
              type: (contractData.type as any) ?? 'PERMANENT',
              salary: contractData.salary ?? null,
              frequency: contractData.frequency ?? 'MONTHLY',
            },
          });
        }
      }

      if (dto.shiftStartAt && dto.shiftEndAt) {
        await this.prisma.shift.create({
          data: {
            employeeId: employee.id,
            startAt: new Date(dto.shiftStartAt),
            endAt: new Date(dto.shiftEndAt),
            type: (dto.shiftType as any) ?? 'DAY',
          },
        });
      }
    }

    return this.findOne(id);
  }

  async clockIn(userId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { userId } });
    if (!employee) throw new NotFoundException('Employe introuvable');
    const today = new Date().toISOString().slice(0, 10);
    const existing = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        createdAt: { gte: new Date(`${today}T00:00:00.000Z`) },
      },
    });
    if (existing) {
      return this.prisma.attendance.update({ where: { id: existing.id }, data: { clockInAt: existing.clockInAt ?? new Date(), status: 'PRESENT' } });
    }
    return this.prisma.attendance.create({ data: { employeeId: employee.id, clockInAt: new Date(), status: 'PRESENT' } });
  }

  async clockOut(userId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { userId } });
    if (!employee) throw new NotFoundException('Employe introuvable');
    const today = new Date().toISOString().slice(0, 10);
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        createdAt: { gte: new Date(`${today}T00:00:00.000Z`) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!attendance) {
      return this.prisma.attendance.create({ data: { employeeId: employee.id, clockInAt: new Date(), clockOutAt: new Date(), status: 'PRESENT' } });
    }
    return this.prisma.attendance.update({ where: { id: attendance.id }, data: { clockOutAt: new Date() } });
  }

  async remove(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
