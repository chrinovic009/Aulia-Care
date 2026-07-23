import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ImagingRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImagingService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.imagingRequest.findMany({
      include: { patient: true, requestedBy: true, consultation: true, report: true },
      orderBy: [{ urgency: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const imagingRequest = await this.prisma.imagingRequest.findUnique({ where: { id }, include: { patient: true, requestedBy: true, consultation: true, report: true } });
    if (!imagingRequest) {
      throw new NotFoundException("Demande d'imagerie introuvable");
    }
    return imagingRequest;
  }

  async updateStatus(id: string, rawStatus: string) {
    await this.findOne(id);
    const status = String(rawStatus || '').toUpperCase() as ImagingRequestStatus;
    if (!Object.values(ImagingRequestStatus).includes(status)) throw new BadRequestException('Statut de radiologie invalide.');
    return this.prisma.imagingRequest.update({ where: { id }, data: { status, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) }, include: { patient: true, report: true } });
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
