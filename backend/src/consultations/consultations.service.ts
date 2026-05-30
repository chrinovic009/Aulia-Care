import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

@Injectable()
export class ConsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createConsultationDto: CreateConsultationDto) {
    return this.prisma.consultation.create({ data: createConsultationDto });
  }

  findAll() {
    return this.prisma.consultation.findMany({ include: { patient: true, provider: true } });
  }

  async findOne(id: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id }, include: { patient: true, provider: true } });
    if (!consultation) {
      throw new NotFoundException('Consultation introuvable');
    }
    return consultation;
  }

  async update(id: string, updateConsultationDto: UpdateConsultationDto) {
    await this.findOne(id);
    return this.prisma.consultation.update({ where: { id }, data: updateConsultationDto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.consultation.delete({ where: { id } });
    return { deleted: true };
  }
}
