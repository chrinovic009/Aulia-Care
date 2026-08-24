import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ImagingRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateImagingCatalogueDto } from './dto/create-imaging-catalogue.dto';

type DashboardPeriod = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH';

type DashboardServiceFilter = 'ALL' | 'EMERGENCY' | 'HOSPITALIZATION' | 'AMBULATORY';

@Injectable()
export class ImagingService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.imagingRequest.findMany({
      include: { patient: true, requestedBy: true, consultation: true, report: true, machine: true, imagingCatalogue: true },
      orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findCatalogue() {
    return this.prisma.imagingCatalogue.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createCatalogue(dto: CreateImagingCatalogueDto) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    if (!code || !name) throw new BadRequestException('Le code et le nom de l examen sont requis.');
    const data = {
        code,
        name,
        modality: dto.modality,
        category: dto.category?.trim() || null,
        description: dto.description?.trim() || null,
        preparationInstructions: dto.preparationInstructions?.trim() || null,
        availableIncidences: dto.availableIncidences?.map((value) => value.trim()).filter(Boolean) || [],
        supportsContrast: Boolean(dto.supportsContrast),
        price: dto.price,
        turnaroundTimeMinutes: dto.turnaroundTimeMinutes ?? null,
        active: dto.active !== false,
      };
    const existing = await this.prisma.imagingCatalogue.findUnique({ where: { code } });
    // An archived catalogue item is revived so administrators can recreate a
    // previously removed examination without violating its unique code.
    if (existing && (existing.deletedAt || !existing.active)) {
      return this.prisma.imagingCatalogue.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } });
    }
    if (existing) throw new BadRequestException('Un examen d’imagerie actif utilise déjà ce code.');
    return this.prisma.imagingCatalogue.create({ data });
  }

  async removeCatalogue(id: string) {
    const catalogue = await this.prisma.imagingCatalogue.findUnique({ where: { id }, include: { _count: { select: { imagingRequests: true } } } });
    if (!catalogue) throw new NotFoundException('Examen d’imagerie introuvable.');
    if (catalogue._count.imagingRequests === 0) {
      await this.prisma.imagingCatalogue.delete({ where: { id } });
      return { success: true, id, deleted: true, archived: false };
    }
    await this.prisma.imagingCatalogue.update({ where: { id }, data: { active: false, deletedAt: new Date(), code: `${catalogue.code}__ARCHIVED__${id.slice(0, 8)}` } });
    return { success: true, id, deleted: false, archived: true };
  }

  findMachines() {
    return this.prisma.imagingMachine.findMany({
      orderBy: [{ name: 'asc' }],
    });
  }

  createMachine(dto: { name: string; roomNumber?: string; isOperational?: boolean }) {
    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!name) {
      throw new BadRequestException('Le nom de l équipement est requis.');
    }

    return this.prisma.imagingMachine.create({
      data: {
        name,
        roomNumber: typeof dto.roomNumber === 'string' && dto.roomNumber.trim() ? dto.roomNumber.trim() : null,
        isOperational: dto.isOperational !== false,
      },
    });
  }

  async findOne(id: string) {
    const imagingRequest = await this.prisma.imagingRequest.findUnique({ where: { id }, include: { patient: true, requestedBy: true, consultation: true, report: true, machine: true, imagingCatalogue: true } });
    if (!imagingRequest) {
      throw new NotFoundException("Demande d'imagerie introuvable");
    }
    return imagingRequest;
  }

  async updateStatus(id: string, rawStatus: string) {
    const request = await this.findOne(id);
    const status = String(rawStatus || '').toUpperCase() as ImagingRequestStatus;
    if (!Object.values(ImagingRequestStatus).includes(status)) throw new BadRequestException('Statut de radiologie invalide.');
    const allowedTransitions: Partial<Record<ImagingRequestStatus, ImagingRequestStatus[]>> = {
      REQUESTED: ['SCHEDULED', 'CANCELLED'],
      SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: ['VERIFIED'],
    };
    if (request.status !== status && !allowedTransitions[request.status]?.includes(status)) {
      throw new BadRequestException(`Transition radiologique interdite : ${request.status} vers ${status}.`);
    }
    return this.prisma.imagingRequest.update({ where: { id }, data: { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) }, include: { patient: true, report: true } });
  }

  async getDashboardOverview(rawPeriod: string = 'TODAY', rawModality: string = 'ALL', rawService: string = 'ALL') {
    const period = (rawPeriod || 'TODAY').toUpperCase() as DashboardPeriod;
    const modality = (rawModality || 'ALL').toUpperCase();
    const service = (rawService || 'ALL').toUpperCase() as DashboardServiceFilter;

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case 'YESTERDAY':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'WEEK':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'MONTH':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'TODAY':
      default:
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
    }

    const where: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (modality !== 'ALL') {
      where.modality = modality;
    }

    const requests = await this.prisma.imagingRequest.findMany({
      where,
      include: {
        patient: true,
        consultation: { include: { hospitalization: true, appointment: true } },
        report: true,
        machine: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    const filteredRequests = requests.filter((request: any) => {
      const normalizedService = this.getServiceBucket(request);
      if (service !== 'ALL' && normalizedService !== service) return false;
      return true;
    });

    const completedStatuses = ['COMPLETED', 'VERIFIED'];
    const activeStatuses = ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'];
    const realized = filteredRequests.filter((request: any) => completedStatuses.includes(request.status)).length;
    const pending = filteredRequests.filter((request: any) => activeStatuses.includes(request.status)).length;

    const waitDurations = filteredRequests
      .map((request: any) => {
        const startTime = request.scheduledAt || request.completedAt || request.createdAt;
        if (!startTime) return 0;
        return Math.max(0, Math.round((new Date(startTime).getTime() - new Date(request.createdAt).getTime()) / 60000));
      })
      .filter((value: number) => value > 0);

    const durationDurations = filteredRequests
      .map((request: any) => {
        if (!request.scheduledAt || !request.completedAt) return 0;
        return Math.max(0, Math.round((new Date(request.completedAt).getTime() - new Date(request.scheduledAt).getTime()) / 60000));
      })
      .filter((value: number) => value > 0);

    const averageWaitMinutes = waitDurations.length ? Math.round(waitDurations.reduce((sum: number, value: number) => sum + value, 0) / waitDurations.length) : 0;
    const averageDurationMinutes = durationDurations.length ? Math.round(durationDurations.reduce((sum: number, value: number) => sum + value, 0) / durationDurations.length) : 0;

    const machineCount = await this.prisma.imagingMachine.count({ where: { isOperational: true } });
    const machineWorkMinutes = durationDurations.reduce((sum: number, value: number) => sum + value, 0);
    const occupancyRate = machineCount > 0 ? Math.min(100, Math.round((machineWorkMinutes / 60) / (12 * machineCount) * 100)) : 0;

    const hourlyActivity = this.buildHourlyActivity(filteredRequests);
    const modalityBreakdown = this.buildModalityBreakdown(filteredRequests);
    const workflowAlerts = this.buildWorkflowAlerts(filteredRequests);
    const activeQueue = this.buildActiveQueue(filteredRequests);
    const equipmentStatus = await this.buildEquipmentStatus();

    return {
      period,
      filters: { modality, service },
      metrics: {
        totalScheduled: filteredRequests.length,
        realized,
        pending,
        averageWaitMinutes,
        averageDurationMinutes,
        occupancyRate,
      },
      hourlyActivity,
      modalityBreakdown,
      workflowAlerts,
      activeQueue,
      equipmentStatus,
    };
  }

  private getServiceBucket(request: any): DashboardServiceFilter {
    if (request.urgency && ['URGENT', 'EMERGENCY', 'HIGH'].includes(String(request.urgency).toUpperCase())) {
      return 'EMERGENCY';
    }
    if (request.consultation?.hospitalizationId) {
      return 'HOSPITALIZATION';
    }
    return 'AMBULATORY';
  }

  private buildHourlyActivity(requests: any[]) {
    const bucket = new Map<string, { hour: string; emergencies: number; hospitalized: number; ambulatory: number; total: number }>();
    requests.forEach((request: any) => {
      const createdAt = new Date(request.createdAt);
      const hour = `${createdAt.getHours().toString().padStart(2, '0')}:00`;
      const entry = bucket.get(hour) || { hour, emergencies: 0, hospitalized: 0, ambulatory: 0, total: 0 };
      const serviceBucket = this.getServiceBucket(request);
      if (serviceBucket === 'EMERGENCY') entry.emergencies += 1;
      if (serviceBucket === 'HOSPITALIZATION') entry.hospitalized += 1;
      if (serviceBucket === 'AMBULATORY') entry.ambulatory += 1;
      entry.total += 1;
      bucket.set(hour, entry);
    });

    return Array.from(bucket.values()).sort((a, b) => a.hour.localeCompare(b.hour));
  }

  private buildModalityBreakdown(requests: any[]) {
    const bucket = new Map<string, number>();
    requests.forEach((request: any) => {
      const modality = request.modality || 'UNKNOWN';
      bucket.set(modality, (bucket.get(modality) || 0) + 1);
    });
    const total = requests.length || 1;
    return Array.from(bucket.entries()).map(([modality, count]) => ({ modality, count, percentage: Math.round((count / total) * 100) }));
  }

  private buildWorkflowAlerts(requests: any[]) {
    const now = Date.now();
    return requests
      .filter((request: any) => request.status === 'COMPLETED' && !request.report && request.completedAt)
      .map((request: any) => ({
        id: request.id,
        patientName: [request.patient?.lastName, request.patient?.firstName].filter(Boolean).join(' '),
        modality: request.modality,
        severity: this.getServiceBucket(request) === 'EMERGENCY' ? 'CRITIQUE' : 'ATTENTION',
        waitingMinutes: Math.max(0, Math.round((now - new Date(request.completedAt).getTime()) / 60000)),
        status: request.status,
        createdAt: request.createdAt,
      }))
      .sort((a, b) => b.waitingMinutes - a.waitingMinutes)
      .slice(0, 8);
  }

  private buildActiveQueue(requests: any[]) {
    return requests
      .filter((request: any) => ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'].includes(request.status))
      .map((request: any) => ({
        id: request.id,
        patientName: [request.patient?.lastName, request.patient?.firstName].filter(Boolean).join(' '),
        modality: request.modality,
        status: request.status,
        room: request.machine?.roomNumber || 'Salle non assignée',
        updatedAt: request.updatedAt,
      }))
      .slice(0, 8);
  }

  private async buildEquipmentStatus() {
    const machines = await this.prisma.imagingMachine.findMany({ orderBy: [{ name: 'asc' }] });
    return machines.map((machine: any) => ({
      id: machine.id,
      name: machine.name,
      roomNumber: machine.roomNumber,
      isOperational: machine.isOperational,
      status: machine.isOperational ? 'En service' : 'En panne',
      alertCount: machine.isOperational ? 0 : 1,
      updatedAt: machine.updatedAt,
    }));
  }

  async saveReport(id: string, body: { findings: string; impression: string; recommendations?: string; verified?: boolean }, interpretedById?: string) {
    await this.findOne(id);
    if (!body.findings?.trim() || !body.impression?.trim()) throw new BadRequestException('Les constatations et la conclusion sont obligatoires.');
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.imagingReport.upsert({
        where: { imagingRequestId: id },
        create: { imagingRequestId: id, interpretedById: interpretedById || null, findings: body.findings.trim(), impression: body.impression.trim(), recommendations: body.recommendations?.trim() || null, verified: Boolean(body.verified), verifiedAt: body.verified ? new Date() : null },
        update: { interpretedById: interpretedById || undefined, findings: body.findings.trim(), impression: body.impression.trim(), recommendations: body.recommendations?.trim() || null, verified: Boolean(body.verified), verifiedAt: body.verified ? new Date() : null },
      });
      await tx.imagingRequest.update({ where: { id }, data: { status: body.verified ? 'VERIFIED' : 'COMPLETED', completedAt: new Date() } });
      return report;
    });
  }
}
