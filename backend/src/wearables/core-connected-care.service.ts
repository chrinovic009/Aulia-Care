import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WearableMetric } from '@prisma/client';
import {
  CONNECTED_CARE_CONTRACT_VERSION,
  ConnectedPurpose,
  ConnectedSubject,
  ConsentPort,
  DeviceGatewayPort,
  DeviceIngestionResult,
  DeviceObservation,
  PatientDirectoryPort,
} from '../platform/contracts/connected-care.contract';
import { PrismaService } from '../prisma/prisma.service';
import { WearablesService } from './wearables.service';

const PURPOSES = new Set<ConnectedPurpose>(['WEARABLES', 'TELEHEALTH', 'MESSAGING', 'LOCATION']);

/** Core implementation of Connected Care ports. It never exposes Prisma to the remote layer. */
@Injectable()
export class CoreConnectedCareService implements PatientDirectoryPort, ConsentPort, DeviceGatewayPort {
  constructor(private readonly prisma: PrismaService, private readonly wearables: WearablesService) {}

  private async requirePortalOwner(patientId: string, actorId?: string) {
    if (!actorId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const owner = await this.prisma.user.findFirst({
      where: { id: actorId, primaryRole: 'PATIENT', status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!owner) throw new ForbiddenException('Compte patient actif requis.');
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, portalUserId: owner.id, clinicId: { not: null }, deletedAt: null },
      select: { id: true, clinicId: true },
    });
    if (!patient?.clinicId) throw new ForbiddenException('Le dossier patient ne peut pas être résolu pour cet établissement.');
    return patient;
  }

  async resolveSubject(subject: ConnectedSubject) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: subject.externalPatientId, clinicId: subject.tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, status: true, clinicId: true, deletedAt: true },
    });
    return {
      active: Boolean(patient && patient.status === 'ACTIVE'),
      displayName: patient?.status === 'ACTIVE' ? `${patient.firstName} ${patient.lastName}` : undefined,
    };
  }

  async hasActiveConsent(subject: ConnectedSubject, purpose: ConnectedPurpose) {
    if (!PURPOSES.has(purpose)) return false;
    const consent = await (this.prisma as any).connectedCareConsent.findFirst({
      where: {
        patientId: subject.externalPatientId,
        patient: { clinicId: subject.tenantId, deletedAt: null },
        purpose,
        consentReference: subject.consentId,
        revokedAt: null,
      },
      select: { id: true },
    });
    return Boolean(consent);
  }

  async ingest(observation: DeviceObservation): Promise<DeviceIngestionResult> {
    if (!observation?.subject || !observation.idempotencyKey || !observation.deviceExternalId) {
      return { accepted: false, reason: 'Incomplete authorised observation.' };
    }
    if (observation.contractVersion !== CONNECTED_CARE_CONTRACT_VERSION) {
      return { accepted: false, reason: 'Unsupported contract version.' };
    }
    if (!Object.values(WearableMetric).includes(observation.metric as WearableMetric)) {
      return { accepted: false, reason: 'Unsupported metric.' };
    }
    const device = await this.prisma.wearableDevice.findFirst({
      where: { externalDeviceId: observation.deviceExternalId, patient: { id: observation.subject.externalPatientId, clinicId: observation.subject.tenantId, deletedAt: null } },
      select: { id: true },
    });
    if (!device) return { accepted: false, reason: 'Unknown device for subject.' };

    const duplicate = await this.prisma.wearableMeasurement.findFirst({
      where: {
        wearableDeviceId: device.id,
        metric: observation.metric as WearableMetric,
        sourceSequence: observation.idempotencyKey,
      },
      select: { id: true },
    });
    if (duplicate) return { accepted: true, referenceId: duplicate.id };

    try {
      const outcome = await this.wearables.ingestMeasurement(device.id, {
        metric: observation.metric,
        value: observation.value,
        unit: observation.unit,
        measuredAt: observation.measuredAt,
        sourceSequence: observation.idempotencyKey,
        quality: observation.quality,
        metadata: { source: observation.source, contractVersion: observation.contractVersion, receivedAt: observation.receivedAt },
      });
      return { accepted: true, referenceId: outcome.measurement.id };
    } catch (error: any) {
      // Concurrent retries can reach the unique measurement index at the same
      // time. Return the already persisted observation rather than duplicate it.
      if (error?.code === 'P2002') {
        const persisted = await this.prisma.wearableMeasurement.findFirst({
          where: { wearableDeviceId: device.id, metric: observation.metric as WearableMetric, sourceSequence: observation.idempotencyKey },
          select: { id: true },
        });
        if (persisted) return { accepted: true, referenceId: persisted.id };
      }
      throw error;
    }
  }

  async grantConsent(
    patientId: string,
    purpose: ConnectedPurpose,
    actor: { userId?: string; role?: string },
  ) {
    if (!PURPOSES.has(purpose)) throw new BadRequestException('Finalité Connected Care invalide.');
    const patient = await this.requirePortalOwner(patientId, actor.userId);
    const consent = await (this.prisma as any).connectedCareConsent.create({
      data: { patientId, purpose, consentReference: randomUUID(), createdById: actor.userId || null },
    });
    await this.prisma.auditTrail.create({
      data: { actorId: actor.userId || null, entity: 'ConnectedCareConsent', entityId: consent.id, action: 'CREATE', after: { patientId, purpose, confirmedByPatient: true } },
    });
    return { id: consent.id, consentReference: consent.consentReference, purpose: consent.purpose, consentedAt: consent.consentedAt };
  }

  async revokeConsent(consentId: string, actor: { userId?: string; role?: string }, reason?: string) {
    if (!actor.userId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const existing = await (this.prisma as any).connectedCareConsent.findUnique({
      where: { id: consentId },
      select: { id: true, revokedAt: true, patientId: true },
    });
    if (!existing) throw new NotFoundException('Consentement introuvable.');
    await this.requirePortalOwner(existing.patientId, actor.userId);
    if (existing.revokedAt) return { id: existing.id, alreadyRevoked: true };
    const consent = await (this.prisma as any).connectedCareConsent.update({
      where: { id: consentId },
      data: { revokedAt: new Date(), revokedReason: String(reason || '').slice(0, 500) || null },
    });
    await this.prisma.auditTrail.create({
      data: { actorId: actor.userId || null, entity: 'ConnectedCareConsent', entityId: consent.id, action: 'UPDATE', after: { revoked: true } },
    });
    return { id: consent.id, revokedAt: consent.revokedAt };
  }
}
