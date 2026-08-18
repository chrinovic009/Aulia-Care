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

  async savePlan(manufacturerInput: string, body: any) {
    const manufacturer = String(manufacturerInput || '').toUpperCase();
    if (!['APPLE', 'SAMSUNG'].includes(manufacturer)) throw new BadRequestException('Seuls les forfaits Apple Watch et Samsung Galaxy Watch sont autorisés.');
    const monthlyPrice = Number(body?.monthlyPrice);
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0 || monthlyPrice > 10_000_000) {
      throw new BadRequestException('Le tarif mensuel CDF est invalide.');
    }
    const plan = await (this.prisma as any).wearablePlan.upsert({
      where: { manufacturer },
      create: { manufacturer, monthlyPrice, currency: 'CDF', active: body?.active !== false },
      update: { monthlyPrice, currency: 'CDF', active: body?.active !== false },
    });
    await (this.prisma as any).wearableLot.updateMany({ where: { manufacturer, planId: null }, data: { planId: plan.id } });
    return plan;
  }

  async receiveLot(body: any, receivedById?: string) {
    const reference = String(body?.reference || '').trim();
    const paidAmount = Number(body?.paidAmount);
    const requestedItems = Array.isArray(body?.items) ? body.items : [];
    const items = requestedItems.map((item: any) => ({ manufacturer: String(item?.manufacturer || '').toUpperCase(), quantity: Number(item?.quantity) }));
    if (!reference || !items.length || !Number.isFinite(paidAmount) || paidAmount < 0 || items.some((item: any) => !['APPLE', 'SAMSUNG'].includes(item.manufacturer) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000)) {
      throw new BadRequestException('La référence, le montant CDF et une quantité valide pour chaque type de montre sont requis.');
    }
    if (new Set(items.map((item: any) => item.manufacturer)).size !== items.length) throw new BadRequestException('Chaque type de montre ne peut apparaître qu’une seule fois dans un même lot.');
    const plans = await (this.prisma as any).wearablePlan.findMany({ where: { manufacturer: { in: items.map((item: any) => item.manufacturer) } } });
    const planByManufacturer = new Map<string, any>(plans.map((plan: any) => [String(plan.manufacturer), plan] as [string, any]));
    return this.prisma.$transaction(async (tx) => {
      const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
      const lots = [];
      for (const item of items) {
        const lot = await (tx as any).wearableLot.create({
          data: {
            reference: `${reference}-${item.manufacturer}`,
            manufacturer: item.manufacturer,
            planId: planByManufacturer.get(item.manufacturer)?.id || null,
            receivedById: receivedById || null,
            note: String(body?.note || '').trim() || null,
            paidAmount: Math.round((paidAmount * item.quantity / totalQuantity) * 100) / 100,
            currency: 'CDF',
          },
        });
        const platform = item.manufacturer === 'APPLE' ? 'WATCHOS' : 'WEAR_OS';
        await (tx as any).wearableInventoryDevice.createMany({
          data: Array.from({ length: item.quantity }, () => ({
            lotId: lot.id,
            platform,
            status: 'AVAILABLE',
            provisionedAt: new Date(),
            // Internal asset identifiers are generated now. During Aulia technical
            // provisioning they are bound to the genuine Apple/Samsung attestation.
            serialNumber: `AULIA-${item.manufacturer}-${randomBytes(10).toString('hex').toUpperCase()}`,
            hardwareKeyId: randomBytes(32).toString('base64url'),
          })),
        });
        lots.push(lot);
      }
      return { reference, totalPaid: paidAmount, currency: 'CDF', lots };
    });
  }

  async getInventoryDashboard(page = 1, limit = 10) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
    await this.refreshSubscriptionStates();
    const db = this.prisma as any;
    const [plans, totalDevices, available, assigned, subscriptions, lots, totalLots] = await Promise.all([
      db.wearablePlan.findMany({ orderBy: { manufacturer: 'asc' } }),
      db.wearableInventoryDevice.count(),
      db.wearableInventoryDevice.count({ where: { status: 'AVAILABLE' } }),
      db.wearableInventoryDevice.count({ where: { status: 'ASSIGNED' } }),
      db.wearableSubscription.findMany({ orderBy: { periodEndAt: 'asc' }, take: safeLimit, skip: (safePage - 1) * safeLimit, include: { patient: { select: { firstName: true, lastName: true } }, wearableDevice: { select: { displayName: true, status: true, externalDeviceId: true } }, inventoryDevice: { select: { serialNumber: true, lot: { select: { manufacturer: true } } } }, plan: true, invoice: { select: { status: true, balanceDue: true } } } }),
      db.wearableLot.findMany({ orderBy: { receivedAt: 'desc' }, take: safeLimit, skip: (safePage - 1) * safeLimit, include: { devices: { select: { status: true } }, plan: true } }),
      db.wearableLot.count(),
    ]);
    const now = Date.now();
    return {
      plans,
      summary: { totalDevices, available, assigned, subscriptionsDue: await db.wearableSubscription.count({ where: { status: { in: ['PENDING_PAYMENT', 'OVERDUE'] } } }) },
      subscriptions: { items: subscriptions.map((subscription: any) => ({ ...subscription, daysRemaining: Math.max(0, Math.ceil((new Date(subscription.periodEndAt).getTime() - now) / 86_400_000)) })), total: await db.wearableSubscription.count(), page: safePage, limit: safeLimit },
      lots: { items: lots, total: totalLots, page: safePage, limit: safeLimit },
    };
  }

  /** Reception sees only the minimum required to hand over an available Aulia watch. */
  async getReceptionDashboard(page = 1, limit = 10) {
    const dashboard = await this.getInventoryDashboard(page, limit);
    const availableDevices = await (this.prisma as any).wearableInventoryDevice.findMany({
      where: { status: 'AVAILABLE', revokedAt: null, provisionedAt: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(10, Math.max(1, limit)),
      select: { serialNumber: true, platform: true, lot: { select: { manufacturer: true } } },
    });
    return { ...dashboard, availableDevices };
  }

  async pairDeviceAtReception(body: any, actorId?: string) {
    const patientId = String(body?.patientId || '').trim();
    const assetCode = String(body?.assetCode || '').trim().toUpperCase();
    if (!patientId || !assetCode) throw new BadRequestException('Sélectionnez un patient et scannez le code Aulia de la montre.');
    if (!assetCode.startsWith('AULIA-')) throw new ForbiddenException('Code non reconnu : seules les montres Aulia Care provisionnées peuvent être attribuées.');
    const inventory = await (this.prisma as any).wearableInventoryDevice.findUnique({
      where: { serialNumber: assetCode }, include: { lot: true },
    });
    if (!inventory) throw new ForbiddenException('Cette montre ne fait pas partie du parc Aulia Care. Distribution refusée.');
    if (inventory.status !== 'AVAILABLE' || inventory.revokedAt || !inventory.provisionedAt) throw new BadRequestException('Cette montre Aulia est indisponible, révoquée ou non encore provisionnée.');
    return this.registerDevice({ patientId, externalDeviceId: inventory.serialNumber, manufacturer: inventory.lot.manufacturer, platform: inventory.platform, displayName: `Montre ${inventory.lot.manufacturer === 'APPLE' ? 'Apple Watch' : 'Samsung Galaxy Watch'} Aulia` }, actorId);
  }

  private async refreshSubscriptionStates() {
    const db = this.prisma as any;
    const now = new Date();
    // A payment is the only event that can reactivate a patient watch.  The UI
    // never controls the device state directly.
    const paidSubscriptions = await db.wearableSubscription.findMany({
      where: {
        status: { in: ['PENDING_PAYMENT', 'OVERDUE'] },
        periodEndAt: { gt: now },
        invoice: { status: 'PAID' },
      },
      select: { id: true, wearableDeviceId: true },
    });
    if (paidSubscriptions.length) {
      await this.prisma.$transaction(async (tx) => {
        await (tx as any).wearableSubscription.updateMany({
          where: { id: { in: paidSubscriptions.map((item: any) => item.id) } },
          data: { status: 'ACTIVE', paidAt: now },
        });
        await tx.wearableDevice.updateMany({
          where: { id: { in: paidSubscriptions.map((item: any) => item.wearableDeviceId) } },
          data: { status: 'ACTIVE' },
        });
      });
    }
    const overdue = await db.wearableSubscription.findMany({ where: { status: { in: ['PENDING_PAYMENT', 'ACTIVE'] }, periodEndAt: { lt: now } }, select: { id: true, wearableDeviceId: true } });
    if (!overdue.length) return;
    await this.prisma.$transaction(async (tx) => {
      await (tx as any).wearableSubscription.updateMany({ where: { id: { in: overdue.map((item: any) => item.id) } }, data: { status: 'OVERDUE' } });
      await tx.wearableDevice.updateMany({ where: { id: { in: overdue.map((item: any) => item.wearableDeviceId) } }, data: { status: 'SUSPENDED' } });
    });
  }

  async registerDevice(body: any, actorId?: string) {
    const patientId = String(body?.patientId || '');
    const externalDeviceId = String(body?.externalDeviceId || '').trim();
    if (!patientId || !externalDeviceId || !body?.manufacturer || !body?.platform) {
      throw new BadRequestException('patientId, fabricant, plateforme et identifiant externe sont requis.');
    }
    const manufacturer = String(body.manufacturer).toUpperCase();
    const platform = String(body.platform).toUpperCase();
    const inventory = await (this.prisma as any).wearableInventoryDevice.findUnique({ where: { serialNumber: externalDeviceId.toUpperCase() }, include: { lot: { include: { plan: true } } } });
    if (!inventory || inventory.status !== 'AVAILABLE' || inventory.revokedAt || !inventory.provisionedAt || inventory.lot.manufacturer !== manufacturer || inventory.platform !== platform || !inventory.lot.plan?.active) {
      throw new ForbiddenException('Cette montre n’est pas une montre Aulia disponible, approuvée et compatible.');
    }
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, clinicId: true } });
    if (!patient) throw new NotFoundException('Patient introuvable.');

    const periodStartAt = new Date();
    const periodEndAt = new Date(periodStartAt.getTime() + 30 * 86_400_000);
    const device = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({ data: { patientId, issuedById: actorId || null, clinicId: patient.clinicId || null, type: 'OTHER', status: 'ISSUED', totalAmount: inventory.lot.plan.monthlyPrice, balanceDue: inventory.lot.plan.monthlyPrice, dueDate: periodStartAt, remarks: `Abonnement mensuel montre ${manufacturer} Aulia` } });
      const created = await tx.wearableDevice.create({ data: { patientId, inventoryDeviceId: inventory.id, externalDeviceId: inventory.serialNumber, manufacturer, platform, displayName: body.displayName?.trim() || null, esimPhoneNumber: body.esimPhoneNumber?.trim() || null, status: 'SUSPENDED' } as any });
      await (tx as any).wearableSubscription.create({ data: { patientId, wearableDeviceId: created.id, inventoryDeviceId: inventory.id, planId: inventory.lot.plan.id, status: 'PENDING_PAYMENT', amount: inventory.lot.plan.monthlyPrice, currency: 'CDF', periodStartAt, periodEndAt, invoiceId: invoice.id } });
      await (tx as any).wearableInventoryDevice.update({ where: { id: inventory.id }, data: { status: 'ASSIGNED', assignedAt: new Date() } });
      return created;
    });
    this.gateway.notifyPatientEvent(patientId, 'wearable.device.registered', { deviceId: device.id, at: new Date().toISOString() });
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

  async listMyChildren(parentUserId?: string) {
    if (!parentUserId) throw new ForbiddenException('Compte parent non authentifié.');
    await this.refreshSubscriptionStates();
    return this.prisma.parentChildLink.findMany({
      where: { parentUserId, status: 'ACTIVE', revokedAt: null },
      orderBy: { acceptedAt: 'desc' },
      select: {
        id: true,
        acceptedAt: true,
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            wearableDevices: {
              orderBy: { lastSeenAt: 'desc' },
              take: 1,
              select: {
                id: true,
                displayName: true,
                status: true,
                lastSeenAt: true,
                subscriptions: {
                  orderBy: { periodEndAt: 'desc' },
                  take: 1,
                  select: { status: true, periodEndAt: true, amount: true, currency: true, invoice: { select: { status: true, balanceDue: true } } },
                },
                measurements: { orderBy: { measuredAt: 'desc' }, take: 6, select: { metric: true, value: true, unit: true, measuredAt: true, quality: true } },
              },
            },
          },
        },
      },
    });
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
    this.gateway.notifyPatientEvent(device.patientId, 'wearable.measurement.received', { deviceId, measurement, assessment });
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
    this.gateway.notifyPatientEvent(patientId, 'wearable.location.requested', { requestId: request.id, deviceId: device.id, expiresAt: request.expiresAt });
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
    this.gateway.notifyPatientEvent(device.patientId, 'wearable.location.received', { location });
    return location;
  }

  async getPatientDashboard(patientId: string, requester: any) {
    if (!STAFF_ROLES.has(requester?.role)) {
      const ownPatient = await this.prisma.patient.findFirst({ where: { OR: [{ email: requester?.email }, { phone: requester?.phone }] }, select: { id: true } });
      const parentLink = await this.prisma.parentChildLink.findFirst({ where: { parentUserId: requester?.userId, childPatientId: patientId, status: 'ACTIVE' } });
      if (ownPatient?.id !== patientId && !parentLink) throw new ForbiddenException('Accès au suivi préventif non autorisé.');
    }
    await this.refreshSubscriptionStates();
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        wearableDevices: {
          orderBy: { lastSeenAt: 'desc' },
          include: {
            measurements: { orderBy: { measuredAt: 'desc' }, take: 100 },
            emergencyLocations: { orderBy: { capturedAt: 'desc' }, take: 1 },
            subscriptions: {
              orderBy: { periodEndAt: 'desc' },
              take: 1,
              select: { status: true, periodStartAt: true, periodEndAt: true, amount: true, currency: true, paidAt: true, invoice: { select: { status: true, balanceDue: true, dueDate: true } } },
            },
          },
        },
      },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    return patient;
  }

  private async createCriticalAlert(patientId: string, measurementId: string, reason: string) {
    const recipients = await this.prisma.user.findMany({ where: { status: 'ACTIVE', primaryRole: { in: ['NURSE', 'PHYSICIAN', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
    await Promise.all(recipients.map(async ({ id }) => {
      const notification = await this.prisma.notification.create({ data: { patientId, recipientId: id, type: 'ALERT', priority: 'CRITICAL', title: 'Alerte clinique critique', message: `${reason}. Évaluation humaine immédiate requise.`, relatedEntity: 'WearableMeasurement', relatedId: measurementId } });
      this.gateway.notifyToUser(id, 'clinical.alert', notification);
    }));
  }
}
