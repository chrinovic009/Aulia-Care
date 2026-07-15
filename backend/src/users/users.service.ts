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

  async create(dto: CreateUserDto) {
    const primaryRole = await this.resolvePrimaryRole(dto);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const employeeDetails = {
      gender: dto.gender ?? null,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      position: dto.position ?? primaryRole,
      employeeNumber: dto.employeeNumber ?? null,
      departmentId: dto.departmentId ?? null,
      serviceUnitId: dto.serviceUnitId ?? null,
    };

    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          username: dto.username.toLowerCase(),
          displayName: dto.displayName,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          primaryRole: dto.primaryRole,

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
    type ContactRole = RoleSlug | 'PATIENT';
    const allowedRolesByRole: Partial<Record<RoleSlug | 'PATIENT', ContactRole[]>> = {
      // Super admin can contact everyone
      SUPER_ADMIN: [
        'ADMIN',
        'RECEPTIONIST',
        'NURSE',
        'PHYSICIAN',
        'LAB_MANAGER',
        'LAB_TECHNICIAN',
        'LAB_MANAGER',
        'RADIOLOGIST',
        'PHARMACIST',
        'CASHIER',
        'PATIENT',
      ],

      // Admin can contact (and be contacted by) everyone
      ADMIN: [
        'SUPER_ADMIN',
        'RECEPTIONIST',
        'NURSE',
        'PHYSICIAN',
        'LAB_MANAGER',
        'LAB_TECHNICIAN',
        'LAB_MANAGER',
        'RADIOLOGIST',
        'PHARMACIST',
        'CASHIER',
        'PATIENT',
      ],
      RECEPTIONIST: ['RECEPTIONIST', 'PATIENT'],
      NURSE: ['NURSE', 'PHYSICIAN', 'PATIENT'],
      PHYSICIAN: ['PHYSICIAN', 'NURSE', 'LAB_TECHNICIAN', 'LAB_MANAGER', 'RADIOLOGIST', 'PHARMACIST'],
      LAB_TECHNICIAN: ['LAB_TECHNICIAN', 'LAB_MANAGER', 'RADIOLOGIST', 'PHARMACIST', 'PHYSICIAN'],
      LAB_MANAGER: ['LAB_TECHNICIAN', 'LAB_MANAGER', 'RADIOLOGIST', 'PHARMACIST', 'PHYSICIAN'],
      RADIOLOGIST: ['LAB_TECHNICIAN', 'LAB_MANAGER', 'RADIOLOGIST', 'PHARMACIST', 'PHYSICIAN'],
      PHARMACIST: ['LAB_TECHNICIAN', 'LAB_MANAGER', 'RADIOLOGIST', 'PHARMACIST', 'PHYSICIAN'],
      PATIENT: ['RECEPTIONIST', 'NURSE', 'PHYSICIAN'],
    };

    const allowedRoles = role ? allowedRolesByRole[role] || [] : [];
    const staffRoles = allowedRoles.filter((allowedRole): allowedRole is RoleSlug => allowedRole !== 'PATIENT');
    const includePatients = allowedRoles.includes('PATIENT');

    const staff = staffRoles.length
      ? await this.prisma.user.findMany({
          where: {
            deletedAt: null,
            status: 'ACTIVE',
            primaryRole: { in: staffRoles },
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

    return [
      ...staff.map((user) => ({
        id: user.id,
        type: 'USER',
        name: user.displayName || `${user.firstName} ${user.lastName}`.trim(),
        role: user.primaryRole,
        subtitle: user.specialty || this.labelRole(user.primaryRole),
        phone: user.phone,
        email: user.email,
      })),
      ...patients.map((patient) => ({
        id: patient.email ? patientUsersByEmail.get(patient.email.toLowerCase()) || patient.id : patient.id,
        patientId: patient.id,
        type: 'PATIENT',
        name: [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' '),
        role: 'PATIENT',
        subtitle: patient.priority ? `Cas ${patient.priority}` : patient.workflowStatus,
        phone: patient.phone,
        email: patient.email,
      })),
    ];
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
    ]) {
      delete data[key];
    }

    if (dto.gender !== undefined) employeeData.gender = dto.gender;
    if (dto.dateOfBirth !== undefined) employeeData.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.position !== undefined) employeeData.position = dto.position;
    if (dto.employeeNumber !== undefined) employeeData.employeeNumber = dto.employeeNumber;
    if (dto.departmentId !== undefined) employeeData.departmentId = dto.departmentId || null;
    if (dto.serviceUnitId !== undefined) employeeData.serviceUnitId = dto.serviceUnitId || null;
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