import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SurgeryService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.surgery.findMany();
  }

  async findOne(id: string) {
    const surgery = await this.prisma.surgery.findUnique({ where: { id } });
    if (!surgery) {
      throw new NotFoundException('Intervention chirurgicale introuvable');
    }
    return surgery;
  }
}
