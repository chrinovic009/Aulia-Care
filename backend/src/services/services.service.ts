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

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateServiceDto) {
    const isParamedical = data.isParamedical !== undefined
      ? data.isParamedical
      : isParamedicalServiceName(data.name);

    const svc = await this.prisma.service.create({ data: { ...data, isParamedical } as any });

    // Ensure department exists for service according to category keywords
    try {
      await this.ensureDepartmentForService(svc.name);
    } catch (err) {
      // don't block service creation on department creation errors
      // log if necessary
    }

    return svc;
  }

  async findAll() {
    const [services, serviceUnits] = await Promise.all([
      this.prisma.service.findMany({
      include: {
        tarifs: { where: { actif: true }, orderBy: { dateDebut: 'desc' } },
        responsables: { where: { actif: true }, include: { user: true } },
        staff: { where: { actif: true }, include: { user: true } },
      },
      orderBy: { name: 'asc' },
      }),
      this.prisma.serviceUnit.findMany({ include: { department: true } }),
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

  async addTarif(dto: any) {
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
      select: { name: true },
    });
    if (!service) throw new NotFoundException('Service introuvable');
    const normalizedName = service.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (['reception', 'caisse', 'secretariat'].includes(normalizedName)) {
      throw new BadRequestException(
        'Ce service est operationnel interne et ne peut pas avoir de tarif patient',
      );
    }
    return this.prisma.serviceTarif.create({ data: dto });
  }

  private async ensureDepartmentForService(serviceName: string) {
    const normalize = (value: string) => value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    const normalizedServiceName = normalize(serviceName);

    const CATEGORY_MAP: { serviceNames: string[]; departmentName: string; departmentType: string }[] = [
      {
        serviceNames: [
          'Pédiatrie', 'Gynécologie & obstétrique', 'Cardiologie', 'Pneumologie',
          'Neurologie', 'Gastro-entérologie', 'Néphrologie', 'Endocrinologie & diabétologie',
          'Dermatologie', 'Rhumatologie', 'Infectiologie', 'Oncologie', 'Gériatrie', 'Médecine du sport',
        ],
        departmentName: 'Medecine Général',
        departmentType: 'MEDICAL',
      },
      {
        serviceNames: [
          'Chirurgie orthopédique & traumatologique', 'Chirurgie cardiovasculaire', 'Neurochirurgie',
          'Chirurgie plastique & reconstructive', 'Chirurgie ORL', 'Chirurgie maxillo-faciale',
          'Chirurgie pédiatrique', 'Chirurgie gynécologique',
        ],
        departmentName: 'Chirurgie générale',
        departmentType: 'SURGERY',
      },
      {
        serviceNames: [
          'Échographie', 'Mammographie', 'Scanner', 'IRM', 'Endoscopie', 'Médecine nucléaire',
          'Laboratoire d’analyses médicales (Département)', 'Hématologie (Laboratoire)',
          'Biochimie (Laboratoire)', 'Microbiologie & Bactériologie (Laboratoire)',
          'Immunologie (Laboratoire)', 'Pathologie & anatomie cytologique', 'Dialyse',
        ],
        departmentName: 'Radiologie (Imagerie)',
        departmentType: 'RADIOLOGY',
      },
      {
        serviceNames: [
          'Pharmacie interne (PUI)', 'Pharmacie externe', 'Gestion des stocks & traçabilité des médicaments',
          'Conseil pharmaceutique personnalisé',
        ],
        departmentName: 'Pharmacie',
        departmentType: 'PHARMACY',
      },
      {
        serviceNames: [
          'Psychologie clinique', 'Thérapies cognitives et comportementales', 'Addictologie',
          'Soutien psychologique & accompagnement familial',
        ],
        departmentName: 'Psychiatrie',
        departmentType: 'MEDICAL',
      },
      {
        serviceNames: [
          'Rééducation fonctionnelle', 'Ergothérapie', 'Orthophonie', 'Nutrition & diététique',
          'Soins palliatifs', 'Douleur & algologie',
        ],
        departmentName: 'Rééducation & Soins paramédicaux',
        departmentType: 'NURSING',
      },
      {
        serviceNames: [
          'Accueil & Tri des urgences (IAO)', 'Zone de déchocage (UHA)', 'Unité d’hospitalisation de courte durée (UHCD)',
          'Urgences pédiatriques', 'Réanimation & Soins intensifs (Département)',
          'Réanimation polyvalente', 'Unité de Surveillance Continue (USC)', 'Soins Intensifs Cardiaques (USIC)',
        ],
        departmentName: 'Urgences',
        departmentType: 'MEDICAL',
      },
      {
        serviceNames: [
          'Hospitalisation complète (Médecine/Chirurgie)', 'Hospitalisation de jour (Ambulatoire)',
          'Bloc opératoire (Gestion)', 'Salle de réveil (SSPI)',
        ],
        departmentName: 'Unités d’hospitalisation',
        departmentType: 'NURSING',
      },
      {
        serviceNames: [
          'Médecine du travail', 'Consultation voyage', 'Check-up complet', 'Téléconsultation & suivi à distance',
        ],
        departmentName: 'Médecine préventive & vaccination',
        departmentType: 'MEDICAL',
      },
      {
        serviceNames: ['Programmes éducatifs pour patients', 'Réception', 'Caisse'],
        departmentName: 'Centre de recherche clinique',
        departmentType: 'ADMINISTRATION',
      },
    ];

    const matchingCategory = CATEGORY_MAP.find((category) =>
      category.serviceNames.some((name) => normalize(name) === normalizedServiceName),
    );

    if (!matchingCategory) {
      return;
    }

    const departmentName = matchingCategory.departmentName;
    const code = departmentName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .slice(0, 50);

    const department = await this.prisma.department.upsert({
      where: { name: departmentName },
      update: {},
      create: {
        name: departmentName,
        type: matchingCategory.departmentType as any,
        code,
        description: `Département créé automatiquement pour regrouper les services liés à ${departmentName}`,
      },
    });

    await (this.prisma as any).serviceUnit.upsert({
      where: {
        departmentId_name: {
          departmentId: department.id,
          name: serviceName,
        },
      },
      update: {},
      create: {
        name: serviceName,
        departmentId: department.id,
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
