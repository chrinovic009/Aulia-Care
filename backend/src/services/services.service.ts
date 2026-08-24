import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

const PARAMEDICAL_KEYWORDS = [
  'radiologie',
  'laboratoire',
  'dialyse',
  'scanner',
  'imagerie',
  'irm',
  'échographie',
  'echographie',
  'mammographie',
  'pathologie',
  'anatomie',
  'nucleaire',
  'nucléaire',
  'endoscopie',
  'paramedical',
  'paramédical',
];

const isParamedicalServiceName = (name: string) => {
  if (!name) return false;
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  return PARAMEDICAL_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

/** Administrative units organise care but are never billable or selectable as
 * patient-facing services. This name check is accent/case insensitive and is
 * complemented by the DepartmentType check below. */
const isAdministrativeServiceName = (name: string) => {
  const normalized = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ['reception', 'accueil', 'caisse', 'cashier', 'finance', 'comptabilite', 'administration', 'gestion', 'secretariat'].some((keyword) => normalized.includes(keyword));
};

const isReceptionAdministrativeUnitName = (name: string) => {
  const normalized = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ['reception', 'accueil', 'caisse', 'cashier', 'finance', 'comptabilite', 'secretariat'].some((keyword) => normalized === keyword);
};

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateServiceDto & { departmentId?: string }) {
    const isParamedical = data.isParamedical !== undefined
      ? data.isParamedical
      : isParamedicalServiceName(data.name);

    const { departmentId, ...serviceData } = data;
    const existing = await this.prisma.service.findFirst({
      where: { name: { equals: data.name.trim(), mode: 'insensitive' } },
    });
    if (existing?.active) {
      throw new BadRequestException('Un service actif porte déjà ce nom.');
    }
    // Services that were deactivated during a configuration removal are revived
    // instead of causing a uniqueness error. Their clinical invoice history stays intact.
    const svc = existing
      ? await this.prisma.service.update({ where: { id: existing.id }, data: { ...serviceData, active: true, isParamedical } as any })
      : await this.prisma.service.create({ data: { ...serviceData, isParamedical } as any });

    try {
      if (departmentId) {
        await this.ensureServiceUnitForDepartment(svc.name, departmentId);
      }
    } catch {
      // Automatic department creation is disabled; only explicit manual linkage is allowed.
    }

    return svc;
  }

  /** A receptionist may configure only the internal reception units, never a
   * patient-facing/clinical service and never a tariff. */
  async createReceptionAdministrativeUnit(data: { name?: string; description?: string }) {
    const name = String(data?.name || '').trim();
    if (!isReceptionAdministrativeUnitName(name)) {
      throw new BadRequestException('La réception peut uniquement créer ou réactiver une unité interne : Réception, Accueil, Caisse, Finance ou Secrétariat.');
    }
    const department = await this.prisma.department.findFirst({
      where: { deletedAt: null, type: 'ADMINISTRATION' },
      select: { id: true },
    });
    if (!department) throw new BadRequestException('Le département Administration & Gestion doit être créé par l’administrateur avant cette action.');

    const existing = await this.prisma.service.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    const service = existing
      ? await this.prisma.service.update({ where: { id: existing.id }, data: { active: true, description: data.description?.trim() || existing.description, isParamedical: false } })
      : await this.prisma.service.create({ data: { name, description: data.description?.trim() || null, active: true, isParamedical: false } });

    await (this.prisma as any).serviceUnit.upsert({
      where: { departmentId_name: { departmentId: department.id, name } },
      update: { active: true, deletedAt: null },
      create: { departmentId: department.id, name, active: true },
    });
    await this.prisma.serviceTarif.updateMany({ where: { serviceId: service.id, actif: true }, data: { actif: false, dateFin: new Date() } });
    return service;
  }

  /** Reception owns only the two admission fees.  The server fixes both
   * business identities so a forged client cannot create a third clinical
   * service or alter any unrelated tariff. */
  async setReceptionAdmissionFee(data: { kind?: string; price?: number | string; description?: string }) {
    const kind = String(data?.kind || '').toUpperCase();
    const definition = kind === 'SPECIALIST'
      ? { name: 'Consultation specialiste - Reception', label: 'Frais d’admission – consultation spécialiste' }
      : kind === 'GENERAL'
        ? { name: 'Consultation generale - Reception', label: 'Frais d’admission – consultation générale' }
        : null;
    if (!definition) throw new BadRequestException('Type de frais invalide. Choisissez GENERAL ou SPECIALIST.');
    const price = Number(data?.price);
    if (!Number.isFinite(price) || price <= 0) throw new BadRequestException('Le tarif d’admission doit être un montant CDF supérieur à zéro.');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.service.findFirst({ where: { name: { equals: definition.name, mode: 'insensitive' } } });
      const service = existing
        ? await tx.service.update({ where: { id: existing.id }, data: { active: true, description: data.description?.trim() || definition.label, isParamedical: false } })
        : await tx.service.create({ data: { name: definition.name, description: data.description?.trim() || definition.label, active: true, isParamedical: false } });
      await tx.serviceTarif.updateMany({ where: { serviceId: service.id, actif: true }, data: { actif: false, dateFin: new Date() } });
      const tarif = await tx.serviceTarif.create({ data: { serviceId: service.id, prix: price, actif: true } });
      return { kind, service, tarif };
    });
  }

  async findAll() {
    const [services, serviceUnits] = await Promise.all([
      this.prisma.service.findMany({
      where: { active: true },
      include: {
        tarifs: { where: { actif: true }, orderBy: { dateDebut: 'desc' } },
        responsables: { where: { actif: true }, include: { user: true } },
        staff: { where: { actif: true }, include: { user: true } },
      },
      orderBy: { name: 'asc' },
      }),
      this.prisma.serviceUnit.findMany({ where: { active: true, deletedAt: null }, include: { department: true } }),
    ]);
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return services.map((service) => {
      const unit = serviceUnits.find((item) => normalize(item.name) === normalize(service.name));
      return {
        ...service,
        departmentId: unit?.departmentId || null,
        department: unit?.department || null,
      };
    });
  }

  async findOne(id: string) {
    const svc = await this.prisma.service.findUnique({
      where: { id },
      include: {
        tarifs: true,
        responsables: { include: { user: true } },
        staff: { include: { user: true } },
      },
    });
    if (!svc) throw new NotFoundException('Service introuvable');
    const serviceUnit = await this.prisma.serviceUnit.findFirst({
      where: { name: { equals: svc.name, mode: 'insensitive' } },
      include: { department: true },
    });
    return {
      ...svc,
      departmentId: serviceUnit?.departmentId || null,
      department: serviceUnit?.department || null,
    };
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.findOne(id);
    const updateData: any = { ...dto };
    if (dto.isParamedical !== undefined) {
      updateData.isParamedical = dto.isParamedical;
    } else if (dto.name) {
      updateData.isParamedical = isParamedicalServiceName(dto.name);
    }
    return this.prisma.service.update({ where: { id }, data: updateData });
  }

  async remove(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Service introuvable');
    }

    await this.prisma.service.update({
      where: { id },
      data: { active: false },
    });

    return { success: true, id };
  }

  async addTarif(dto: any) {
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
      select: { id: true, name: true },
    });
    if (!service) throw new NotFoundException('Service introuvable');
    const normalizedName = service.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    const serviceUnit = await this.prisma.serviceUnit.findFirst({
      where: { name: { equals: service.name, mode: 'insensitive' }, deletedAt: null },
      include: { department: { select: { type: true, name: true } } },
    });
    const isAdministrativeDepartment = serviceUnit?.department?.type === 'ADMINISTRATION'
      || isAdministrativeServiceName(serviceUnit?.department?.name || '');
    if (isAdministrativeServiceName(normalizedName) || isAdministrativeDepartment) {
      throw new BadRequestException(
        'Une unité administrative (réception, caisse, finance ou gestion) est interne et ne peut jamais recevoir un tarif patient.',
      );
    }
    return this.prisma.serviceTarif.create({ data: dto });
  }

  private async ensureDepartmentForService(_serviceName: string) {
    // Automatic department creation is disabled for services.
    // Departments must be created and linked manually by administrators.
    return;
  }

  private async ensureServiceUnitForDepartment(serviceName: string, departmentId: string) {
    await (this.prisma as any).serviceUnit.upsert({
      where: {
        departmentId_name: {
          departmentId,
          name: serviceName,
        },
      },
      update: {},
      create: {
        name: serviceName,
        departmentId,
        location: null,
        contactNumber: null,
        active: true,
      },
    });
  }

  async addResponsables(
    items: {
      serviceId: string;
      userId: string;
      principal?: boolean;
    }[],
  ) {
    const created = [];

    const allowedChiefRoles = [
      'PHYSICIAN',
      'SURGEON',
      'RADIOLOGIST',
      'ANESTHESIOLOGIST',
      'LAB_TECHNICIAN',
      'LAB_MANAGER',
      'PHARMACIST',
      'NURSE',
      'RECEPTIONIST',
      'CASHIER',
    ];

    for (const it of items) {

      const user = await this.prisma.user.findUnique({
        where: {
          id: it.userId,
        },
      });

      if (!user) {
        throw new NotFoundException(
          'Utilisateur introuvable',
        );
      }

      if (
        user.primaryRole &&
        !allowedChiefRoles.includes(
          user.primaryRole,
        )
      ) {
        throw new BadRequestException(
          'Cet utilisateur ne peut pas être responsable de service',
        );
      }

      const existing = await this.prisma.serviceResponsable.findFirst({
        where: {
          serviceId: it.serviceId,
          userId: it.userId,
        },
      });

      const rec = existing
        ? await this.prisma.serviceResponsable.update({
            where: { id: existing.id },
            data: {
              principal: !!it.principal,
              actif: true,
            },
          })
        : await this.prisma.serviceResponsable.create({
            data: {
              serviceId: it.serviceId,
              userId: it.userId,
              principal: !!it.principal,
              actif: true,
            },
          });

      created.push(rec);
    }

    return created;
  }

  async addStaff(items: any[]) {
    const created = [];

    const allowedRoles = [
      'PHYSICIAN',
      'SURGEON',
      'NURSE',
      'RADIOLOGIST',
      'LAB_TECHNICIAN',
      'LAB_MANAGER',
      'ANESTHESIOLOGIST',
      'PHARMACIST',
      'ADMIN',
      'RECEPTIONIST',
      'CASHIER',
    ];

    for (const item of items) {

      const user = await this.prisma.user.findUnique({
        where: { id: item.userId },
      });

      if (!user) {
        throw new NotFoundException(
          'Utilisateur introuvable',
        );
      }

      if (
        user.primaryRole &&
        !allowedRoles.includes(user.primaryRole)
      ) {
        throw new BadRequestException(
          'Rôle non autorisé dans un service médical'
        );
      }

      await this.prisma.serviceStaff.updateMany({
        where: {
          userId: item.userId,
          serviceId: { not: item.serviceId },
          actif: true,
        },
        data: { actif: false },
      });

      const staff = await this.prisma.serviceStaff.upsert({
        where: {
          serviceId_userId: {
            serviceId: item.serviceId,
            userId: item.userId,
          },
        },
        create: {
          serviceId: item.serviceId,
          userId: item.userId,
          roleInService: item.roleInService,
          actif: true,
        },
        update: {
          roleInService: item.roleInService,
          actif: true,
        },
      });

      created.push(staff);
    }

    return created;
  }
}
