import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHospitalizationDto } from './dto/create-hospitalization.dto';
import { UpdateHospitalizationDto } from './dto/update-hospitalization.dto';

@Injectable()
export class HospitalizationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createHospitalizationDto: CreateHospitalizationDto) {
    return this.prisma.hospitalization.create({ data: createHospitalizationDto });
  }

  findAll() {
    return this.prisma.hospitalization.findMany({ include: { patient: true, serviceUnit: true } });
  }

  async findOne(id: string) {
    const hospitalization = await this.prisma.hospitalization.findUnique({ where: { id }, include: { patient: true, serviceUnit: true } });
    if (!hospitalization) {
      throw new NotFoundException('Hospitalisation introuvable');
    }
    return hospitalization;
  }

  async update(id: string, updateHospitalizationDto: UpdateHospitalizationDto) {
    await this.findOne(id);
    return this.prisma.hospitalization.update({ where: { id }, data: updateHospitalizationDto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.hospitalization.delete({ where: { id } });
    return { deleted: true };
  }
}
