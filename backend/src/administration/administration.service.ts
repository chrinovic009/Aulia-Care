import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateClinicBrandingDto } from './dto/update-clinic-branding.dto';
import { UpdateClinicOperationalPolicyDto } from './dto/update-clinic-operational-policy.dto';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto';
import { isValidClockTime, isValidIanaTimezone, SYSTEM_MAX_NURSE_PATIENT_CAPACITY } from '../core/operational-policy';

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly departmentTypes = new Set([
    'RECEPTION', 'NURSING', 'MEDICAL', 'LABORATORY', 'RADIOLOGY', 'SURGERY', 'PHARMACY', 'BILLING', 'ADMINISTRATION',
  ]);

  private async requireClinicAdministrator(userId?: string) {
    if (!userId) throw new ForbiddenException('Administrateur authentifié requis.');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, clinicId: true, primaryRole: true, deletedAt: true, status: true },
    });
    if (!user || user.deletedAt || user.status !== 'ACTIVE' || user.primaryRole !== 'ADMIN' || !user.clinicId) {
      throw new ForbiddenException('Seul un administrateur rattaché à cet établissement peut modifier cette configuration.');
    }
    return user;
  }

  async getClinicOperationalPolicy(userId?: string) {
    const admin = await this.requireClinicAdministrator(userId);
    return this.prisma.clinic.findUniqueOrThrow({
      where: { id: admin.clinicId },
      select: {
        id: true,
        timezone: true,
        dayShiftStart: true,
        dayShiftEnd: true,
        nightShiftStart: true,
        nightShiftEnd: true,
        defaultNursePatientCapacity: true,
        autoNurseRelayEnabled: true,
        updatedAt: true,
      },
    });
  }

  async updateClinicOperationalPolicy(userId: string | undefined, dto: UpdateClinicOperationalPolicyDto) {
    const admin = await this.requireClinicAdministrator(userId);
    const before = await this.prisma.clinic.findUniqueOrThrow({
      where: { id: admin.clinicId },
      select: {
        timezone: true,
        dayShiftStart: true,
        dayShiftEnd: true,
        nightShiftStart: true,
        nightShiftEnd: true,
        defaultNursePatientCapacity: true,
        autoNurseRelayEnabled: true,
      },
    });
    if (dto.timezone !== undefined && !isValidIanaTimezone(dto.timezone)) {
      throw new BadRequestException('La timezone doit être un identifiant IANA valide, par exemple Africa/Lubumbashi.');
    }
    for (const [field, value] of Object.entries({
      dayShiftStart: dto.dayShiftStart,
      dayShiftEnd: dto.dayShiftEnd,
      nightShiftStart: dto.nightShiftStart,
      nightShiftEnd: dto.nightShiftEnd,
    })) {
      if (value !== undefined && !isValidClockTime(value)) {
        throw new BadRequestException(`${field} doit respecter le format HH:mm.`);
      }
    }
    if (dto.defaultNursePatientCapacity !== undefined && (
      !Number.isInteger(dto.defaultNursePatientCapacity)
      || dto.defaultNursePatientCapacity < 1
      || dto.defaultNursePatientCapacity > SYSTEM_MAX_NURSE_PATIENT_CAPACITY
    )) {
      throw new BadRequestException(`La capacité doit être un entier entre 1 et ${SYSTEM_MAX_NURSE_PATIENT_CAPACITY}.`);
    }

    const data: Prisma.ClinicUpdateInput = {
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.dayShiftStart !== undefined ? { dayShiftStart: dto.dayShiftStart } : {}),
      ...(dto.dayShiftEnd !== undefined ? { dayShiftEnd: dto.dayShiftEnd } : {}),
      ...(dto.nightShiftStart !== undefined ? { nightShiftStart: dto.nightShiftStart } : {}),
      ...(dto.nightShiftEnd !== undefined ? { nightShiftEnd: dto.nightShiftEnd } : {}),
      ...(dto.defaultNursePatientCapacity !== undefined ? { defaultNursePatientCapacity: dto.defaultNursePatientCapacity } : {}),
      ...(dto.autoNurseRelayEnabled !== undefined ? { autoNurseRelayEnabled: dto.autoNurseRelayEnabled } : {}),
    };
    const auditAfter = {
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.dayShiftStart !== undefined ? { dayShiftStart: dto.dayShiftStart } : {}),
      ...(dto.dayShiftEnd !== undefined ? { dayShiftEnd: dto.dayShiftEnd } : {}),
      ...(dto.nightShiftStart !== undefined ? { nightShiftStart: dto.nightShiftStart } : {}),
      ...(dto.nightShiftEnd !== undefined ? { nightShiftEnd: dto.nightShiftEnd } : {}),
      ...(dto.defaultNursePatientCapacity !== undefined ? { defaultNursePatientCapacity: dto.defaultNursePatientCapacity } : {}),
      ...(dto.autoNurseRelayEnabled !== undefined ? { autoNurseRelayEnabled: dto.autoNurseRelayEnabled } : {}),
      reason: dto.reason?.trim() || null,
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.update({ where: { id: admin.clinicId }, data });
      await tx.auditTrail.create({
        data: {
          actorId: admin.id,
          entity: 'CLINIC_OPERATIONAL_POLICY',
          entityId: admin.clinicId,
          action: 'UPDATE',
          before,
          after: auditAfter,
        },
      });
      return clinic;
    });
    return updated;
  }

  private validateDepartmentInput(data: any) {
    const name = String(data?.name || '').trim();
    const code = String(data?.code || '').trim().toUpperCase();
    const type = String(data?.type || '').trim().toUpperCase();
    if (!name || !code) throw new BadRequestException('Le nom et le code du département sont obligatoires.');
    if (!this.departmentTypes.has(type)) throw new BadRequestException('Le type de département choisi est invalide.');
    return { name, code, type };
  }

  async getClinicBranding(userId?: string) {
    if (!userId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { clinicId: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.status !== 'ACTIVE' || !user.clinicId) {
      throw new ForbiddenException('Utilisateur non rattaché à un établissement actif.');
    }
    const clinic = await this.prisma.clinic.findFirst({
      where: { id: user.clinicId, deletedAt: null },
      select: { id: true, name: true, brandDisplayName: true, documentLogoUrl: true, documentLogoUpdatedAt: true, legalName: true, registrationNumber: true, rccmNumber: true, taxNumber: true, nationalIdNumber: true, phone: true, email: true, website: true, address: true, city: true, province: true, neighborhood: true, country: true, currency: true, documentFooter: true, timezone: true, establishmentType: true },
    });
    if (!clinic) throw new ForbiddenException('Établissement introuvable ou archivé.');
    return clinic;
  }

  async updateClinicBranding(userId: string | undefined, data: UpdateClinicBrandingDto) {
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, clinicId: true, primaryRole: true } })
      : null;
    if (!user || user.primaryRole !== 'SUPER_ADMIN' || !user.clinicId) {
      throw new ForbiddenException('Seul le Super Admin rattaché à son établissement peut modifier son identité.');
    }
    const brandDisplayName = data.brandDisplayName?.trim();
    if (brandDisplayName !== undefined && (brandDisplayName.length < 2 || brandDisplayName.length > 100)) {
      throw new BadRequestException('Le nom affiché doit contenir entre 2 et 100 caractères.');
    }
    const documentLogoUrl = data.documentLogoUrl === null ? null : data.documentLogoUrl?.trim();
    if (documentLogoUrl && documentLogoUrl.length > 700_000) {
      throw new BadRequestException('Le logo est trop volumineux. Utilisez une image optimisée de moins de 500 Ko.');
    }
    const before = await this.prisma.clinic.findUniqueOrThrow({ where: { id: user.clinicId } });
    return this.prisma.$transaction(async (tx) => {
      const clinic = await tx.clinic.update({
      where: { id: user.clinicId },
      data: {
        // `name` is the canonical establishment name used by older print
        // templates.  Keep it synchronized with the configured display name
        // so documents cannot keep an obsolete clinic identity.
        ...(brandDisplayName !== undefined ? { name: brandDisplayName, brandDisplayName } : {}),
        ...(data.documentLogoUrl !== undefined ? { documentLogoUrl, documentLogoUpdatedAt: new Date() } : {}),
        ...(data.legalName !== undefined ? { legalName: data.legalName.trim() || null } : {}),
        ...(data.registrationNumber !== undefined ? { registrationNumber: data.registrationNumber.trim() || null } : {}),
        ...(data.rccmNumber !== undefined ? { rccmNumber: data.rccmNumber.trim() || null } : {}),
        ...(data.taxNumber !== undefined ? { taxNumber: data.taxNumber.trim() || null } : {}),
        ...(data.nationalIdNumber !== undefined ? { nationalIdNumber: data.nationalIdNumber.trim() || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone.trim() || null } : {}),
        ...(data.email !== undefined ? { email: data.email.trim().toLowerCase() || null } : {}),
        ...(data.address !== undefined ? { address: data.address.trim() || null } : {}),
        ...(data.city !== undefined ? { city: data.city.trim() || null } : {}),
        ...(data.country !== undefined ? { country: data.country.trim() || null } : {}),
        ...(data.documentFooter !== undefined ? { documentFooter: data.documentFooter.trim() || null } : {}),
      },
      select: { id: true, name: true, brandDisplayName: true, documentLogoUrl: true, documentLogoUpdatedAt: true, legalName: true, registrationNumber: true, rccmNumber: true, taxNumber: true, nationalIdNumber: true, phone: true, email: true, address: true, city: true, country: true, documentFooter: true },
      });
      await tx.auditTrail.create({
        data: {
          actorId: user.id,
          entity: 'CLINIC',
          entityId: user.clinicId,
          action: 'UPDATE',
          before: { clinicId: before.id, name: before.name, brandDisplayName: before.brandDisplayName },
          after: { event: 'CLINIC_IDENTITY_UPDATED', clinicId: user.clinicId, name: clinic.name, brandDisplayName: clinic.brandDisplayName },
        },
      });
      return clinic;
    });
  }

  async addDepartmentResponsables(
    items: {
      departmentId: string;
      userId: string;
      principal?: boolean;
      replaceExistingPrincipal?: boolean;
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
      'ADMIN',
      'RECEPTIONIST',
      'CASHIER',
    ];

    for (const it of items) {
      const user = await this.prisma.user.findUnique({ where: { id: it.userId } });
      if (!user) throw new BadRequestException('Utilisateur introuvable');

      if (user.primaryRole && !allowedChiefRoles.includes(user.primaryRole)) {
        throw new BadRequestException('Cet utilisateur ne peut pas être responsable de département');
      }

      const existing = await this.prisma.departmentResponsable.findFirst({
        where: { departmentId: it.departmentId, userId: it.userId },
      });

      if (it.principal) {
        const currentPrincipal = await this.prisma.departmentResponsable.findFirst({
          where: { departmentId: it.departmentId, principal: true, actif: true, userId: { not: it.userId } },
          include: { user: { select: { displayName: true, firstName: true, lastName: true } } },
        });
        if (currentPrincipal && !it.replaceExistingPrincipal) {
          const principalName = currentPrincipal.user?.displayName || `${currentPrincipal.user?.firstName || ''} ${currentPrincipal.user?.lastName || ''}`.trim();
          throw new BadRequestException(`Un responsable est déjà désigné${principalName ? ` : ${principalName}` : ''}. Confirmez son remplacement pour poursuivre.`);
        }
        if (currentPrincipal) {
          await this.prisma.departmentResponsable.update({
            where: { id: currentPrincipal.id },
            data: { principal: false, actif: true },
          });
        }
      }

      const rec = existing
        ? await this.prisma.departmentResponsable.update({
            where: { id: existing.id },
            data: { principal: !!it.principal, actif: true },
          })
        : await this.prisma.departmentResponsable.create({
            data: { departmentId: it.departmentId, userId: it.userId, principal: !!it.principal, actif: true },
          });

      created.push(rec);
    }

    return created;
  }

  departments() {
    return (this.prisma as any).department.findMany({
      where: { deletedAt: null },
      include: {
        services: { // <-- Assure-toi que c'est bien "services" dans ton schema.prisma
          where: { deletedAt: null },
          include: {
            rooms: { include: { beds: true } },
          },
        },
        Employee: true,
        departmentResponsabilites: { include: { user: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  serviceUnits() {
    return (this.prisma as any).serviceUnit.findMany({
      where: { deletedAt: null },
      include: {
        department: true,
        rooms: { include: { beds: true } },
        Employee: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async createDepartment(data: any) {
    const normalized = this.validateDepartmentInput(data);
    if (!data.type) {
      throw new BadRequestException("Le champ 'type' (DepartmentType) est requis pour créer un département.");
    }

    try {
      return await (this.prisma as any).department.create({
        data: { name: normalized.name, code: normalized.code, type: normalized.type, description: data.description ?? null, isParamedical: data.isParamedical ?? false },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Un département actif utilise déjà ce nom ou ce code.');
      throw error;
    }
  }

  async updateDepartment(id: string, data: any) {
    const existing = await (this.prisma as any).department.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('Département introuvable');
    }

    const normalized = this.validateDepartmentInput({
      name: data.name ?? existing.name,
      code: data.code ?? existing.code,
      type: data.type ?? existing.type,
    });
    return (this.prisma as any).department.update({
      where: { id },
      data: {
        name: normalized.name,
        code: normalized.code,
        type: normalized.type,
        description: data.description ?? existing.description,
        isParamedical: data.isParamedical ?? existing.isParamedical,
      },
    });
  }

  async removeDepartment(id: string) {
    const existing = await (this.prisma as any).department.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException('Département introuvable');
    }

    const [units, employees, responsables] = await Promise.all([
      (this.prisma as any).serviceUnit.count({ where: { departmentId: id, deletedAt: null } }),
      (this.prisma as any).employee.count({ where: { departmentId: id } }),
      (this.prisma as any).departmentResponsable.count({ where: { departmentId: id } }),
    ]);
    if (units === 0 && employees === 0 && responsables === 0) {
      await (this.prisma as any).department.delete({ where: { id } });
      return { success: true, id, deleted: true, archived: false };
    }

    // Preserve clinical references, but make the archived configuration invisible
    // and free its name/code for a later legitimate recreation.
    const archivedAt = new Date();
    const suffix = `__ARCHIVED__${id.slice(0, 8)}`;
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.serviceUnit.updateMany({ where: { departmentId: id, deletedAt: null }, data: { deletedAt: archivedAt, active: false } });
      await tx.employee.updateMany({ where: { departmentId: id }, data: { departmentId: null } });
      await tx.departmentResponsable.deleteMany({ where: { departmentId: id } });
      await tx.department.update({ where: { id }, data: { deletedAt: archivedAt, name: `${existing.name}${suffix}`, code: `${existing.code}${suffix}` } });
    });
    return { success: true, id, deleted: false, archived: true };
  }

  async createServiceUnit(data: any) {
    const department = await this.prisma.department.findFirst({
      where: { id: data.departmentId, deletedAt: null },
      select: { id: true, type: true, name: true },
    });
    if (!department) throw new NotFoundException('Département introuvable.');
    const name = String(data.name || '').trim();
    if (!name) throw new BadRequestException('Le nom de l’unité est obligatoire.');
    const prior = await (this.prisma as any).serviceUnit.findFirst({ where: { departmentId: department.id, name } });
    const created = prior
      ? await (this.prisma as any).serviceUnit.update({ where: { id: prior.id }, data: { deletedAt: null, location: data.location ?? null, contactNumber: data.contactNumber ?? null, active: data.active ?? true } })
      : await (this.prisma as any).serviceUnit.create({ data: { name, departmentId: department.id, location: data.location ?? null, contactNumber: data.contactNumber ?? null, active: data.active ?? true } });
    return { ...created, billable: department.type !== 'ADMINISTRATION' };
  }

  async rooms(actorId?: string) {
    const clinic = await this.requireClinicAdministrator(actorId);
    const [rooms, operatingRooms] = await Promise.all([
      this.prisma.room.findMany({
        where: { serviceUnit: { clinicId: clinic.clinicId } },
        include: { serviceUnit: { include: { department: true } }, beds: { include: { hospitalization: { include: { patient: true } } } }, staffAssignments: { where: { active: true }, include: { user: { select: { id: true, firstName: true, lastName: true, primaryRole: true } } } } },
        orderBy: { number: 'asc' },
      }),
      this.prisma.operatingRoom.findMany({ where: { deletedAt: null }, include: { surgeries: { orderBy: { scheduledAt: 'desc' }, take: 10 } }, orderBy: { name: 'asc' } }),
    ]);
    return { rooms, operatingRooms };
  }

  /** Personnel que l'administrateur peut affecter à une salle de son établissement.
   *  Cette liste est volontairement bornée au tenant courant : elle ne réutilise pas
   *  l'annuaire global des utilisateurs. */
  async roomStaff(actorId?: string) {
    const clinic = await this.requireClinicAdministrator(actorId);
    return this.prisma.user.findMany({
      where: {
        clinicId: clinic.clinicId,
        status: 'ACTIVE',
        deletedAt: null,
        primaryRole: { in: ['PHYSICIAN', 'NURSE', 'RECEPTIONIST', 'LAB_MANAGER', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST'] },
      },
      select: { id: true, firstName: true, lastName: true, displayName: true, primaryRole: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private async validateRoomMembers(clinicId: string, staffUserIds: string[] = []) {
    if (!staffUserIds.length) return;
    const found = await this.prisma.user.findMany({ where: { id: { in: staffUserIds }, clinicId, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (found.length !== staffUserIds.length) throw new BadRequestException('Chaque personnel affecté doit être actif et rattaché au même établissement.');
  }

  async createRoom(data: CreateRoomDto, actorId?: string) {
    const clinic = await this.requireClinicAdministrator(actorId);
    const serviceUnit = await this.prisma.serviceUnit.findFirst({ where: { id: data.serviceUnitId, clinicId: clinic.clinicId, active: true, deletedAt: null }, select: { id: true } });
    if (!serviceUnit) throw new BadRequestException('Unité de service introuvable ou hors établissement.');
    await this.validateRoomMembers(clinic.clinicId, data.staffUserIds);
    return this.prisma.room.create({
      data: { number: data.number.trim(), name: data.name.trim(), location: data.location.trim(), serviceUnitId: serviceUnit.id, staffAssignments: data.staffUserIds?.length ? { createMany: { data: data.staffUserIds.map((userId) => ({ userId })) } } : undefined },
      include: { beds: true, serviceUnit: true, staffAssignments: { include: { user: { select: { id: true, firstName: true, lastName: true, primaryRole: true } } } } },
    });
  }

  async updateRoom(id: string, data: UpdateRoomDto, actorId?: string) {
    const clinic = await this.requireClinicAdministrator(actorId);
    const existing = await this.prisma.room.findFirst({ where: { id, serviceUnit: { clinicId: clinic.clinicId } }, select: { id: true, serviceUnitId: true } });
    if (!existing) throw new NotFoundException('Salle introuvable dans cet établissement.');
    if (data.serviceUnitId) {
      const unit = await this.prisma.serviceUnit.findFirst({ where: { id: data.serviceUnitId, clinicId: clinic.clinicId, active: true, deletedAt: null }, select: { id: true } });
      if (!unit) throw new BadRequestException('Unité de service introuvable ou inactive.');
    }
    await this.validateRoomMembers(clinic.clinicId, data.staffUserIds);
    return this.prisma.$transaction(async (tx) => {
      if (data.staffUserIds) {
        await tx.roomStaffAssignment.updateMany({ where: { roomId: id, userId: { notIn: data.staffUserIds }, active: true }, data: { active: false, releasedAt: new Date() } });
        for (const userId of data.staffUserIds) await tx.roomStaffAssignment.upsert({ where: { roomId_userId: { roomId: id, userId } }, create: { roomId: id, userId }, update: { active: true, releasedAt: null } });
      }
      return tx.room.update({ where: { id }, data: { number: data.number?.trim(), name: data.name?.trim(), location: data.location?.trim(), serviceUnitId: data.serviceUnitId }, include: { beds: true, serviceUnit: true, staffAssignments: { where: { active: true }, include: { user: { select: { id: true, firstName: true, lastName: true, primaryRole: true } } } } } });
    });
  }

  async removeRoom(id: string, actorId?: string) {
    const clinic = await this.requireClinicAdministrator(actorId);
    const existing = await this.prisma.room.findFirst({ where: { id, serviceUnit: { clinicId: clinic.clinicId } }, include: { beds: true } });
    if (!existing) throw new NotFoundException('Salle introuvable dans cet établissement.');
    if (existing.beds.some((bed) => bed.status === 'OCCUPIED')) throw new BadRequestException('Une salle avec un lit occupé ne peut pas être supprimée.');
    await this.prisma.room.delete({ where: { id } });
    return { success: true, id };
  }

  createBed(data: any) {
    return (this.prisma as any).bed.create({
      data: {
        roomId: data.roomId,
        code: data.code,
        status: data.status ?? 'FREE',
      },
    });
  }

  createOperatingRoom(data: any) {
    return (this.prisma as any).operatingRoom.create({
      data: {
        name: data.name,
        location: data.location ?? null,
        capacity: Number(data.capacity || 1),
        active: data.active ?? true,
      },
    });
  }

  async updateOperatingRoom(id: string, data: any) {
    const existing = await (this.prisma as any).operatingRoom.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bloc opératoire introuvable');

    return (this.prisma as any).operatingRoom.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        location: data.location ?? existing.location,
        capacity: data.capacity !== undefined ? Number(data.capacity) : existing.capacity,
        active: data.active ?? existing.active,
      },
    });
  }

  async removeOperatingRoom(id: string) {
    const existing = await (this.prisma as any).operatingRoom.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Bloc opératoire introuvable');

    await (this.prisma as any).operatingRoom.delete({ where: { id } });
    return { success: true, id };
  }

  stocks() {
    return (this.prisma as any).medicationStock.findMany({
      where: { deletedAt: null },
      orderBy: [{ expiryDate: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async stockCatalog() {
    const [medications, stocks, suppliers, movements, lots, transactions, purchaseOrders, goodsReceipts, dispenses] = await Promise.all([
      (this.prisma as any).medication.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
      this.stocks(),
      (this.prisma as any).supplier.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
      (this.prisma as any).stockMovement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      (this.prisma as any).stockLot.findMany({ include: { medication: true }, orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'desc' }] }),
      (this.prisma as any).stockTransaction.findMany({ include: { medication: true, lot: true, performedBy: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      (this.prisma as any).purchaseOrder.findMany({ include: { supplier: true, lines: { include: { medication: true } } }, orderBy: { orderedAt: 'desc' }, take: 50 }),
      (this.prisma as any).goodsReceipt.findMany({ include: { supplier: true, lines: { include: { medication: true } } }, orderBy: { receivedAt: 'desc' }, take: 50 }),
      (this.prisma as any).pharmacyDispense.findMany({ include: { prescription: { include: { patient: true } }, lines: { include: { medication: true } } }, orderBy: { dispensedAt: 'desc' }, take: 50 }),
    ]);

    return { medications, stocks, suppliers, movements, lots, transactions, purchaseOrders, goodsReceipts, dispenses };
  }

  async createMedication(data: any) {
    const code = String(data.code || '').trim();
    const name = String(data.name || '').trim();
    const unit = String(data.unit || '').trim();
    const strength = String(data.strength || '').trim() || null;

    if (!code || !name || !unit) {
      throw new BadRequestException('Le code, le nom et l\'unité du médicament sont requis.');
    }

    let existing = await (this.prisma as any).medication.findUnique({
      where: { code },
      include: { StockLot: true },
    });
    if (!existing) {
      existing = await (this.prisma as any).medication.findFirst({
        where: {
          deletedAt: null,
          name,
          unit,
          strength,
        },
        include: { StockLot: true },
      });
    }

    if (existing) {
      const currentQuantity = (existing.StockLot || []).reduce((sum: number, lot: any) => sum + Number(lot.quantity || 0), 0);
      throw new ConflictException({
        message: 'Un médicament identique existe déjà dans le stock.',
        medication: {
          id: existing.id,
          code: existing.code,
          name: existing.name,
          unit: existing.unit,
          strength: existing.strength,
          manufacturer: existing.manufacturer,
          currentQuantity,
        },
      });
    }

    return (this.prisma as any).medication.create({
      data: {
        code,
        name,
        description: data.description ?? null,
        unit,
        strength,
        manufacturer: data.manufacturer ?? null,
      },
    });
  }

  createSupplier(data: any) {
    return (this.prisma as any).supplier.create({
      data: {
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        address: data.address ?? null,
        status: data.status ?? 'ACTIVE',
      },
    });
  }

  createStockLot(data: any) {
    return (this.prisma as any).stockLot.create({
      data: {
        medicationId: data.medicationId,
        batchNumber: data.batchNumber,
        quantity: Number(data.quantity || 0),
        purchasePrice: data.purchasePrice ? Number(data.purchasePrice) : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      },
      include: { medication: true },
    });
  }

  async reports() {
    // OPTIMISATION : On charge uniquement les entités légères, ajoute des "take: 100" ou des filtres sur les grosses tables en prod
    const [patients, users, services, invoices, payments, hospitalizations, medications, departments, rooms, consultations, prescriptions, insurances, attendances, leaveRequests, payrolls, auditTrails] =
      await Promise.all([
        (this.prisma as any).patient.findMany({ where: { deletedAt: null }, take: 500 }), 
        (this.prisma as any).user.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).service.findMany({ include: { staff: true, responsables: true } }),
        (this.prisma as any).invoice.findMany({ where: { deletedAt: null }, take: 200 }),
        (this.prisma as any).payment.findMany({ where: { deletedAt: null }, take: 200 }),
        (this.prisma as any).hospitalization.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).medication.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).department.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).room.findMany({ include: { beds: true } }),
        (this.prisma as any).consultation.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
        (this.prisma as any).prescription.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
        (this.prisma as any).insuranceClaim.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 }),
        (this.prisma as any).attendance.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
        (this.prisma as any).leaveRequest.findMany({ orderBy: { requestedAt: 'desc' }, take: 100 }),
        (this.prisma as any).payroll.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
        (this.prisma as any).auditTrail.findMany({ orderBy: { changedAt: 'desc' }, take: 50 }),
      ]);

    return { patients, users, services, invoices, payments, hospitalizations, medications, departments, rooms, consultations, prescriptions, insurances, attendances, leaveRequests, payrolls, auditTrails };
  }

  async dashboard() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // OPTIMISATION: Utilisation de requêtes ciblées pour les comptages globaux plutôt que de charger des listes entières
    const [
      totalPatientsCount,
      urgentPatients,
      consultationsToday,
      hospitalizations,
      invoicesMonthCount,
      paymentsMonth,
      rooms,
      services,
      stocks,
      lots,
      recentConsultations,
    ] = await Promise.all([
      (this.prisma as any).patient.count({ where: { deletedAt: null } }),
      (this.prisma as any).patient.findMany({
        where: {
          deletedAt: null,
          priority: { in: ['urgent', 'urgence', 'prioritaire', 'critical', 'critique', 'URGENT', 'CRITICAL'] }
        }
      }),
      (this.prisma as any).consultation.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: startOfToday, lt: startOfTomorrow },
        },
        include: { patient: true, provider: true },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).hospitalization.findMany({
        where: { status: { in: ['ADMITTED', 'TRANSFERRED'] } },
        include: { patient: true, ServiceUnit: true },
      }),
      (this.prisma as any).invoice.count({
        where: { deletedAt: null, issuedAt: { gte: startOfMonth } },
      }),
      (this.prisma as any).payment.findMany({
        where: { deletedAt: null, paidAt: { gte: startOfMonth } },
        select: { amount: true } // Rend la requête ultra légère
      }),
      (this.prisma as any).room.findMany({
        include: { beds: true },
      }),
      (this.prisma as any).service.findMany({
        include: {
          staff: { where: { actif: true } },
          responsables: { where: { actif: true } },
          patients: { where: { deletedAt: null } },
          tarifs: { where: { actif: true }, orderBy: { dateDebut: 'desc' }, take: 1 },
        },
        orderBy: { name: 'asc' },
      }),
      (this.prisma as any).medicationStock.findMany({ where: { deletedAt: null } }),
      (this.prisma as any).stockLot.findMany({ include: { medication: true } }),
      (this.prisma as any).consultation.findMany({
        where: { deletedAt: null },
        include: { patient: true, provider: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const beds = rooms.flatMap((room: any) => room.beds || []);
    const availableBeds = beds.filter((bed: any) => bed.status === 'FREE').length;
    
    const criticalStockItems = [
      ...stocks.filter((stock: any) => Number(stock.quantity || 0) <= Number(stock.criticalLevel || 0)),
      ...lots.filter((lot: any) => Number(lot.quantity || 0) <= 3),
    ];

    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        activePatients: totalPatientsCount, // Valeur optimisée via .count()
        consultationsToday: consultationsToday.length,
        hospitalizations: hospitalizations.length,
        invoicesMonth: invoicesMonthCount, // Valeur optimisée via .count()
        paymentsMonth: paymentsMonth.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0),
        availableBeds,
        criticalAlerts: criticalStockItems.length + urgentPatients.length + (availableBeds === 0 ? 1 : 0),
      },
      alerts: {
        criticalStock: criticalStockItems.map((item: any) => ({
          id: item.id,
          medication: item.medication?.name || item.medicationId,
          quantity: item.quantity,
          threshold: item.criticalLevel || 3,
        })),
        urgentPatients: urgentPatients.map((patient: any) => ({
          id: patient.id,
          name: [patient.firstName, patient.lastName].filter(Boolean).join(' '),
          priority: patient.priority,
          workflowStatus: patient.workflowStatus,
        })),
        beds: { available: availableBeds, total: beds.length },
      },
      performanceByService: services.map((service: any) => ({
        id: service.id,
        name: service.name,
        staffCount: service.staff?.length || 0,
        responsibleCount: service.responsables?.length || 0,
        patientCount: service.patients?.length || 0,
        active: service.active,
        currentTarif: service.tarifs?.[0]?.prix || null,
      })),
      recent: {
        consultations: recentConsultations,
        hospitalizations,
      },
    };
  }

  /**
   * Indicateurs de pilotage consolidés. Les chiffres financiers sont calculés
   * sur les écritures réelles : une facture est facturée, un paiement est
   * encaissé. Ils ne constituent pas un rapprochement bancaire certifié.
   */
  async executiveDashboard() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const historyStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [
      activePatients,
      newPatientsToday,
      consultationsToday,
      activeHospitalizations,
      invoices,
      payments,
      claims,
      services,
      users,
      rooms,
      criticalLots,
      payrollMonth,
    ] = await Promise.all([
      (this.prisma as any).patient.count({ where: { deletedAt: null } }),
      (this.prisma as any).patient.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
      (this.prisma as any).consultation.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
      (this.prisma as any).hospitalization.count({ where: { deletedAt: null, status: { in: ['ADMITTED', 'TRANSFERRED'] } } }),
      (this.prisma as any).invoice.findMany({
        where: { deletedAt: null, issuedAt: { gte: historyStart } },
        select: { issuedAt: true, totalAmount: true, balanceDue: true, status: true },
      }),
      (this.prisma as any).payment.findMany({
        where: { deletedAt: null, paidAt: { gte: historyStart } },
        select: { paidAt: true, amount: true, method: true },
      }),
      (this.prisma as any).insuranceClaim.findMany({
        where: { deletedAt: null },
        select: { amountClaimed: true, amountApproved: true, status: true, submittedAt: true, createdAt: true },
      }),
      (this.prisma as any).service.findMany({
        where: { active: true },
        select: { id: true, name: true, _count: { select: { patients: true, staff: true } } },
        orderBy: { name: 'asc' },
      }),
      (this.prisma as any).user.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, select: { primaryRole: true } }),
      (this.prisma as any).room.findMany({ select: { beds: { select: { status: true } } } }),
      (this.prisma as any).stockLot.findMany({ where: { quantity: { lte: 3 } }, select: { id: true, quantity: true, medication: { select: { name: true } } }, take: 20 }),
      (this.prisma as any).payroll.aggregate({ where: { status: { in: ['PROCESSED', 'PAID'] }, periodEnd: { gte: monthStart } }, _sum: { netAmount: true } }),
    ]);

    const amount = (value: unknown) => Number(value || 0);
    const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const months = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
      return { key: monthKey(date), label: date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) };
    });
    const monthly = new Map(months.map((month) => [month.key, { ...month, billed: 0, collected: 0, patientPayments: 0, insurancePayments: 0 }]));
    invoices.forEach((invoice: any) => {
      const item = monthly.get(monthKey(new Date(invoice.issuedAt)));
      if (item) item.billed += amount(invoice.totalAmount);
    });
    payments.forEach((payment: any) => {
      const item = monthly.get(monthKey(new Date(payment.paidAt)));
      if (!item) return;
      const paid = amount(payment.amount);
      item.collected += paid;
      if (payment.method === 'INSURANCE') item.insurancePayments += paid;
      else item.patientPayments += paid;
    });

    const thisMonth = monthly.get(monthKey(now))!;
    const receivables = invoices.reduce((sum: number, invoice: any) => sum + amount(invoice.balanceDue), 0);
    const insuranceOutstanding = claims
      .filter((claim: any) => ['DRAFT', 'SUBMITTED', 'IN_REVIEW'].includes(claim.status))
      .reduce((sum: number, claim: any) => sum + Math.max(0, amount(claim.amountClaimed) - amount(claim.amountApproved)), 0);
    const overdueClaims = claims.filter((claim: any) => ['DRAFT', 'SUBMITTED', 'IN_REVIEW'].includes(claim.status) && new Date(claim.submittedAt || claim.createdAt) < ninetyDaysAgo);
    const beds = rooms.flatMap((room: any) => room.beds);
    const freeBeds = beds.filter((bed: any) => bed.status === 'FREE').length;
    const roleCounts = users.reduce((result: Record<string, number>, user: any) => {
      const role = String(user.primaryRole || 'NON_ATTRIBUÉ');
      result[role] = (result[role] || 0) + 1;
      return result;
    }, {});

    return {
      generatedAt: now.toISOString(),
      disclaimer: 'Les encaissements proviennent des paiements enregistrés. La trésorerie bancaire doit être rapprochée dans le module Finance.',
      overview: { activePatients, newPatientsToday, consultationsToday, activeHospitalizations, freeBeds, totalBeds: beds.length },
      financial: {
        billedMonth: thisMonth.billed,
        collectedMonth: thisMonth.collected,
        receivables,
        patientPaymentsMonth: thisMonth.patientPayments,
        insurancePaymentsMonth: thisMonth.insurancePayments,
        insuranceOutstanding,
        payrollMonth: amount(payrollMonth._sum.netAmount),
        monthly: Array.from(monthly.values()),
      },
      performance: {
        services: services.map((service: any) => ({ name: service.name, patients: service._count.patients, staff: service._count.staff })),
        roles: Object.entries(roleCounts).map(([role, count]) => ({ role, count })),
      },
      alerts: [
        ...criticalLots.map((lot: any) => ({ level: 'CRITIQUE', category: 'Stock', message: `${lot.medication?.name || 'Médicament'} : seulement ${lot.quantity} unité(s) disponible(s).` })),
        ...overdueClaims.map((claim: any) => ({ level: 'ÉLEVÉE', category: 'Créance assurance', message: `Une demande assurance dépasse 90 jours sans décision.` })),
        ...(freeBeds === 0 ? [{ level: 'ÉLEVÉE', category: 'Capacité', message: 'Aucun lit disponible actuellement.' }] : []),
      ],
      reports: {
        invoicesInPeriod: invoices.length,
        paymentsInPeriod: payments.length,
        claimsPending: claims.filter((claim: any) => ['DRAFT', 'SUBMITTED', 'IN_REVIEW'].includes(claim.status)).length,
        activeStaff: users.length,
      },
    };
  }
}
