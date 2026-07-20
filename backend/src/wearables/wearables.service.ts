import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmergencyLocationReason, LocationSource, MeasurementQuality, WearableMetric } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { createHash, randomBytes } from 'crypto';

type AlertLevel = 'NORMAL' | 'WATCH' | 'CRITICAL';

const STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'NURSE', 'PHYSICIAN']);

/**
 * Conservative safety screen, not a diagnostic algorithm. Its output only requests
 * a clinical review; treatment decisions always remain with licensed staff.
 */
function assessMeasurement(metric: WearableMetric, value: number): { level: AlertLevel; reason?: string } {
  const limits: Record<WearableMetric, { watch: [number, number]; critical: [number, number] }> = {
    HEART_RATE_BPM: { watch: [50, 110], critical: [40, 130] },
    BLOOD_PRESSURE_SYSTOLIC_MMHG: { watch: [90, 140], critical: [80, 180] },
    BLOOD_PRESSURE_DIASTOLIC_MMHG: { watch: [55, 90], critical: [45, 120] },
    BLOOD_GLUCOSE_MG_DL: { watch: [70, 180], critical: [54, 300] },
    SPO2_PERCENT: { watch: [92, 100], critical: [88, 100] },
    WEIGHT_KG: { watch: [0, 500], critical: [0, 500] },
    BODY_FAT_PERCENT: { watch: [0, 70], critical: [0, 80] },
  };
  const rule = limits[metric];
  if (value < rule.critical[0] || value > rule.critical[1]) return { level: 'CRITICAL', reason: `${metric}: ${value}` };
  if (value < rule.watch[0] || value > rule.watch[1]) return { level: 'WATCH', reason: `${metric}: ${value}` };
  return { level: 'NORMAL' };
}

@Injectable()
export class WearablesService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: NotificationsGateway) {}

  async registerDevice(body: any, actorId?: string) {
    const patientId = String(body?.patientId || '');
    const externalDeviceId = String(body?.externalDeviceId || '').trim();
    if (!patientId || !externalDeviceId || !body?.manufacturer || !body?.platform) {
      throw new BadRequestException('patientId, fabricant, plateforme et identifiant externe sont requis.');
    }
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Patient introuvable.');

    const device = await this.prisma.wearableDevice.create({
      data: {
        patientId,
        externalDeviceId,
        manufacturer: body.manufacturer,
        platform: body.platform,
        displayName: body.displayName?.trim() || null,
        esimPhoneNumber: body.esimPhoneNumber?.trim() || null,
      },
    });
    this.gateway.notify('wearable.device.registered', { deviceId: device.id, patientId, actorId, at: new Date().toISOString() });
    return device;
  }

  async createParentChildLink(body: any, actorId?: string) {
    const parentUserId = String(body?.parentUserId || '');
    const childPatientId = String(body?.childPatientId || '');
    if (!parentUserId || !childPatientId) throw new BadRequestException('Le parent et l enfant sont requis.');
    const [parent, child] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: parentUserId }, select: { id: true, status: true } }),
      this.prisma.patient.findUnique({ where: { id: childPatientId }, select: { id: true } }),
    ]);
    if (!parent || parent.status !== 'ACTIVE' || !child) throw new NotFoundException('Parent ou enfant introuvable.');
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const link = await this.prisma.parentChildLink.upsert({
      where: { parentUserId_childPatientId: { parentUserId, childPatientId } },
      create: { parentUserId, childPatientId, tokenHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
      update: { tokenHash, status: 'PENDING', expiresAt: new Date(Date.now() + 15 * 60 * 1000), acceptedAt: null, revokedAt: null },
    });
    await this.prisma.auditTrail.create({ data: { actorId: actorId || null, entity: 'ParentChildLink', entityId: link.id, action: 'CREATE', after: { childPatientId, parentUserId, expiresAt: link.expiresAt } } as any });
    return { linkId: link.id, pairingToken: rawToken, expiresAt: link.expiresAt };
  }

  async confirmParentChildLink(rawToken: string, parentUserId?: string) {
    if (!rawToken || !parentUserId) throw new BadRequestException('Jeton de couplage invalide.');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const link = await this.prisma.parentChildLink.findUnique({ where: { tokenHash } });
    if (!link || link.parentUserId !== parentUserId || link.status !== 'PENDING' || link.expiresAt <= new Date()) {
      throw new ForbiddenException('Jeton expiré, invalide ou non autorisé.');
    }
    const active = await this.prisma.parentChildLink.update({ where: { id: link.id }, data: { status: 'ACTIVE', acceptedAt: new Date() } });
    this.gateway.notifyToUser(parentUserId, 'parent-child-link.activated', { childPatientId: active.childPatientId });
    return active;
  }

  async ingestMeasurement(deviceId: string, body: any, actorId?: string) {
    const device = await this.prisma.wearableDevice.findUnique({ where: { id: deviceId }, include: { patient: true } });
    if (!device) throw new NotFoundException('Montre introuvable.');
    if (device.status !== 'ACTIVE') throw new ForbiddenException('Cette montre n est pas active.');

    const value = Number(body?.value);
    const measuredAt = new Date(body?.measuredAt || Date.now());
    if (!Number.isFinite(value) || Number.isNaN(measuredAt.getTime()) || !body?.metric || !body?.unit) {
      throw new BadRequestException('metric, value, unit et measuredAt valides sont requis.');
    }
    const assessment = assessMeasurement(body.metric as WearableMetric, value);
    const measurement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.wearableMeasurement.create({
        data: {
          wearableDeviceId: device.id,
          patientId: device.patientId,
          metric: body.metric,
          value,
          unit: String(body.unit),
          measuredAt,
          sourceSequence: String(body.sourceSequence || ''),
          quality: (body.quality || 'UNKNOWN') as MeasurementQuality,
          metadata: body.metadata || undefined,
        },
      });
      await tx.wearableDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
      return created;
    });

    const event = { patientId: device.patientId, deviceId, measurement, assessment, actorId };
    this.gateway.notify('wearable.measurement.received', event);
    if (assessment.level === 'CRITICAL') await this.createCriticalAlert(device.patientId, measurement.id, assessment.reason || 'Valeur critique');
    return { measurement, assessment, clinicalInstruction: assessment.level === 'CRITICAL' ? 'Évaluation clinique immédiate requise.' : 'Aucune décision thérapeutique automatique.' };
  }

  async requestEmergencyLocation(patientId: string, body: any, requester: any) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    const requesterId = requester?.userId;
    const role = requester?.role;
    if (!STAFF_ROLES.has(role)) {
      const link = await this.prisma.parentChildLink.findFirst({ where: { parentUserId: requesterId, childPatientId: patientId, status: 'ACTIVE' } });
      if (!link) throw new ForbiddenException('Le parent n est pas autorisé à localiser ce patient.');
    }
    const device = body?.wearableDeviceId
      ? await this.prisma.wearableDevice.findFirst({ where: { id: body.wearableDeviceId, patientId, status: 'ACTIVE' } })
      : await this.prisma.wearableDevice.findFirst({ where: { patientId, status: 'ACTIVE' }, orderBy: { lastSeenAt: 'desc' } });
    if (!device) throw new BadRequestException('Aucune montre active n est liée à ce patient.');

    const request = await this.prisma.emergencyLocationRequest.create({
      data: {
        patientId,
        wearableDeviceId: device.id,
        requestedById: requesterId,
        reason: (body?.reason || EmergencyLocationReason.PARENT_IMMEDIATE_LOCATION) as EmergencyLocationReason,
        status: 'DISPATCHED',
        expiresAt: new Date(Date.now() + Math.min(Math.max(Number(body?.ttlSeconds || 300), 30), 900) * 1000),
      },
    });
    // The production APNs/FCM adapter consumes this command. The backend never bypasses watch OS consent.
    this.gateway.notify('wearable.location.requested', { requestId: request.id, patientId, deviceId: device.id, expiresAt: request.expiresAt });
    return request;
  }

  async ingestLocation(deviceId: string, body: any, actorId?: string) {
    const device = await this.prisma.wearableDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.status !== 'ACTIVE') throw new NotFoundException('Montre active introuvable.');
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    const capturedAt = new Date(body?.capturedAt || Date.now());
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException('Coordonnées GPS ou horodatage invalides.');
    }
    const request = body?.requestId
      ? await this.prisma.emergencyLocationRequest.findFirst({ where: { id: body.requestId, patientId: device.patientId, wearableDeviceId: device.id, status: { in: ['PENDING', 'DISPATCHED'] } } })
      : null;
    if (body?.requestId && !request) throw new ForbiddenException('Demande de localisation invalide ou expirée.');
    const location = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emergencyLocation.create({ data: { patientId: device.patientId, wearableDeviceId: device.id, requestId: request?.id || null, latitude, longitude, accuracyMeters: body?.accuracyMeters ? Number(body.accuracyMeters) : null, altitudeMeters: body?.altitudeMeters ? Number(body.altitudeMeters) : null, capturedAt, source: (body?.source || LocationSource.WATCH_GPS) as LocationSource } });
      await tx.wearableDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), lastLocationAt: capturedAt } });
      if (request) await tx.emergencyLocationRequest.update({ where: { id: request.id }, data: { status: 'FULFILLED', fulfilledAt: new Date() } });
      return created;
    });
    this.gateway.notify('wearable.location.received', { location, actorId });
    return location;
  }

  async getPatientDashboard(patientId: string, requester: any) {
    if (!STAFF_ROLES.has(requester?.role)) {
      const ownPatient = await this.prisma.patient.findFirst({ where: { OR: [{ email: requester?.email }, { phone: requester?.phone }] }, select: { id: true } });
      const parentLink = await this.prisma.parentChildLink.findFirst({ where: { parentUserId: requester?.userId, childPatientId: patientId, status: 'ACTIVE' } });
      if (ownPatient?.id !== patientId && !parentLink) throw new ForbiddenException('Accès au suivi préventif non autorisé.');
    }
    return this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, firstName: true, lastName: true, wearableDevices: { orderBy: { lastSeenAt: 'desc' }, include: { measurements: { orderBy: { measuredAt: 'desc' }, take: 100 }, emergencyLocations: { orderBy: { capturedAt: 'desc' }, take: 1 } } } } });
  }

  private async createCriticalAlert(patientId: string, measurementId: string, reason: string) {
    const recipients = await this.prisma.user.findMany({ where: { status: 'ACTIVE', primaryRole: { in: ['NURSE', 'PHYSICIAN', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
    await Promise.all(recipients.map(async ({ id }) => {
      const notification = await this.prisma.notification.create({ data: { patientId, recipientId: id, type: 'ALERT', priority: 'CRITICAL', title: 'Alerte clinique critique', message: `${reason}. Évaluation humaine immédiate requise.`, relatedEntity: 'WearableMeasurement', relatedId: measurementId } });
      this.gateway.notifyToUser(id, 'clinical.alert', notification);
    }));
  }
}
