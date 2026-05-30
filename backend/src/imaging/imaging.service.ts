import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImagingService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.imagingRequest.findMany();
  }

  async findOne(id: string) {
    const imagingRequest = await this.prisma.imagingRequest.findUnique({ where: { id } });
    if (!imagingRequest) {
      throw new NotFoundException('Demande d'imagerie introuvable');
    }
    return imagingRequest;
  }
}
