import { Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus, RoleSlug } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
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

        status: 'ACTIVE',
      },
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        firstName: true,
        lastName: true,
        primaryRole: true,
        phone: true,
        status: true,
      },
    });
  }
  async findContactsForRole(role?: RoleSlug | 'PATIENT', userId?: string) {
    type ContactRole = RoleSlug | 'PATIENT';
    const allowedRolesByRole: Partial<Record<RoleSlug | 'PATIENT', ContactRole[]>> = {
      SUPER_ADMIN: [
        'ADMIN',
        'RECEPTIONIST',
        'NURSE',
        'PHYSICIAN',
        'LAB_TECHNICIAN',
        'RADIOLOGIST',
        'PHARMACIST',
        'CASHIER',
        'PATIENT',
      ],
      ADMIN: [
        'RECEPTIONIST',
        'NURSE',
        'PHYSICIAN',
        'LAB_TECHNICIAN',
        'RADIOLOGIST',
        'PHARMACIST',
        'CASHIER',
        'PATIENT',
      ],
      RECEPTIONIST: ['RECEPTIONIST', 'PATIENT'],
      NURSE: ['NURSE', 'PHYSICIAN', 'PATIENT'],
      PHYSICIAN: ['PHYSICIAN', 'NURSE', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST'],
      LAB_TECHNICIAN: ['LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'PHYSICIAN'],
      RADIOLOGIST: ['LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'PHYSICIAN'],
      PHARMACIST: ['LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'PHYSICIAN'],
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

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }

    if (data.email) data.email = data.email.toLowerCase();
    if (data.username) data.username = data.username.toLowerCase();

    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
