import { Injectable, NotFoundException } from '@nestjs/common';
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

  async addResponsables(items: { serviceId: string; userId: string; principal?: boolean }[]) {
    const created = [] as any[];
    for (const it of items) {
      const rec = await this.prisma.serviceResponsable.create({ data: { serviceId: it.serviceId, userId: it.userId, principal: !!it.principal } });
      created.push(rec);
    }
    return created;
  }
}
