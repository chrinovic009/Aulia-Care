import { Injectable, NotFoundException } from '@nestjs/common';
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