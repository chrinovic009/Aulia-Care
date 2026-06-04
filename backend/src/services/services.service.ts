import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateServiceDto) {
    return this.prisma.service.create({ data });
  }

  findAll() {
    return this.prisma.service.findMany({ include: { tarifs: { where: { actif: true }, orderBy: { dateDebut: 'desc' } }, responsables: { include: { user: true } } } });
  }

  async findOne(id: string) {
    const svc = await this.prisma.service.findUnique({ where: { id }, include: { tarifs: true, responsables: { include: { user: true } } } });
    if (!svc) throw new NotFoundException('Service introuvable');
    return svc;
  }

  async update(id: string, dto: UpdateServiceDto) {
    await this.findOne(id);
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async addTarif(dto: any) {
    return this.prisma.serviceTarif.create({ data: dto });
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

      const rec =
        await this.prisma.serviceResponsable.create({
          data: {
            serviceId: it.serviceId,
            userId: it.userId,
            principal: !!it.principal,
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

      const staff = await this.prisma.serviceStaff.create({
        data: {
          serviceId: item.serviceId,
          userId: item.userId,
          roleInService: item.roleInService,
        },
      });

      created.push(staff);
    }

    return created;
  }
}
