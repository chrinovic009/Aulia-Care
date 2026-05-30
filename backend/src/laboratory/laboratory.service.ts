import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LaboratoryService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.labRequest.findMany();
  }

  async findOne(id: string) {
    const request = await this.prisma.labRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Demande de laboratoire introuvable');
    }
    return request;
  }
}
