import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmergencyLocationReason, LocationSource, MeasurementQuality, WearableMetric } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { AuthenticatedActor, ClinicContextService } from '../core/clinic-context.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private requireClinic(actorId?: string) {
    return this.clinicContext.requireOperationalActor({ userId: actorId });
  }

  private async resolvePatientAccess(patientId: string, requester?: AuthenticatedActor) {
    const userId = requester?.userId || requester?.id;
    if (!userId) throw new ForbiddenException('Utilisateur authentifié requis.');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, primaryRole: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new ForbiddenException('Compte actif requis.');
    }
    if (user.primaryRole && STAFF_ROLES.has(user.primaryRole)) {
      const actor = await this.requireClinic(user.id);
      const patient = await this.prisma.patient.findFirst({
        where: { id: patientId, clinicId: actor.clinicId, deletedAt: null },
        select: { id: true, clinicId: true },
      });
      if (!patient) throw new NotFoundException('Patient introuvable dans cet établissement.');
      return patient;
    }
    const ownPatient = await this.prisma.patient.findFirst({
      where: { id: patientId, portalUserId: user.id, deletedAt: null },
      select: { id: true, clinicId: true },
    });
    if (ownPatient) return ownPatient;
    const parentLink = await this.prisma.parentChildLink.findFirst({
      where: { parentUserId: user.id, childPatientId: patientId, status: 'ACTIVE', revokedAt: null },
      select: { childPatientId: true },
    });
    if (!parentLink) throw new ForbiddenException('Accès au suivi préventif non autorisé.');
    const child = await this.prisma.patient.findFirst({
      where: { id: parentLink.childPatientId, deletedAt: null },
      select: { id: true, clinicId: true },
    });
    if (!child) throw new NotFoundException('Patient introuvable.');
    return child;
  }

  async savePlan(manufacturerInput: string, body: unknown, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const manufacturer = String(manufacturerInput || '').toUpperCase();
    if (!['APPLE', 'SAMSUNG'].includes(manufacturer)) throw new BadRequestException('Seuls les forfaits Apple Watch et Samsung Galaxy Watch sont autorisés.');
    const input = body as { monthlyPrice?: unknown; active?: unknown } | undefined;
    const monthlyPrice = Number(input?.monthlyPrice);
    if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0 || monthlyPrice > 10_000_000) {
      throw new BadRequestException('Le tarif mensuel CDF est invalide.');
    }
    const plan = await this.prisma.wearablePlan.upsert({
      where: {
        clinicId_manufacturer: {
          clinicId: actor.clinicId,
          manufacturer: manufacturer as 'APPLE' | 'SAMSUNG',
        },
      },
      create: {
        clinicId: actor.clinicId,
        manufacturer: manufacturer as 'APPLE' | 'SAMSUNG',
        monthlyPrice,
        currency: 'CDF',
        active: input?.active !== false,
      },
      update: { monthlyPrice, currency: 'CDF', active: input?.active !== false },
    });
    await this.prisma.wearableLot.updateMany({
      where: {
        clinicId: actor.clinicId,
        manufacturer: manufacturer as 'APPLE' | 'SAMSUNG',
        planId: null,
      },
      data: { planId: plan.id },
    });
    return plan;
  }

  async receiveLot(body: unknown, receivedById?: string) {
    const actor = await this.requireClinic(receivedById);
    const input = body as {
      reference?: unknown;
      paidAmount?: unknown;
      items?: Array<{ manufacturer?: unknown; quantity?: unknown }>;
      note?: unknown;
    } | undefined;
    const reference = String(input?.reference || '').trim();
    const paidAmount = Number(input?.paidAmount);
    const requestedItems = Array.isArray(input?.items) ? input.items : [];
    const items = requestedItems.map((item: any) => ({ manufacturer: String(item?.manufacturer || '').toUpperCase(), quantity: Number(item?.quantity) }));
    if (!reference || !items.length || !Number.isFinite(paidAmount) || paidAmount < 0 || items.some((item: any) => !['APPLE', 'SAMSUNG'].includes(item.manufacturer) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000)) {
      throw new BadRequestException('La référence, le montant CDF et une quantité valide pour chaque type de montre sont requis.');
    }
    if (new Set(items.map((item: any) => item.manufacturer)).size !== items.length) throw new BadRequestException('Chaque type de montre ne peut apparaître qu’une seule fois dans un même lot.');
    const plans = await this.prisma.wearablePlan.findMany({
      where: {
        clinicId: actor.clinicId,
        manufacturer: { in: items.map((item) => item.manufacturer as 'APPLE' | 'SAMSUNG') },
      },
    });
    const planByManufacturer = new Map<string, any>(plans.map((plan: any) => [String(plan.manufacturer), plan] as [string, any]));
    return this.prisma.$transaction(async (tx) => {
      const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
      const lots = [];
      for (const item of items) {
        const lot = await (tx as any).wearableLot.create({
          data: {
            clinicId: actor.clinicId,
            reference: `${reference}-${item.manufacturer}`,
            manufacturer: item.manufacturer as 'APPLE' | 'SAMSUNG',
            planId: planByManufacturer.get(item.manufacturer)?.id || null,
            receivedById: actor.id,
            note: String(input?.note || '').trim() || null,
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

  async getInventoryDashboard(page = 1, limit = 10, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
    await this.refreshSubscriptionStates(actor.clinicId);
    const clinicId = actor.clinicId;
    const db = this.prisma;
    const [plans, totalDevices, available, assigned, subscriptions, lots, totalLots] = await Promise.all([
      db.wearablePlan.findMany({ where: { clinicId }, orderBy: { manufacturer: 'asc' } }),
      db.wearableInventoryDevice.count({ where: { lot: { clinicId } } }),
      db.wearableInventoryDevice.count({ where: { status: 'AVAILABLE', lot: { clinicId } } }),
      db.wearableInventoryDevice.count({ where: { status: 'ASSIGNED', lot: { clinicId } } }),
      db.wearableSubscription.findMany({ where: { patient: { clinicId } }, orderBy: { periodEndAt: 'asc' }, take: safeLimit, skip: (safePage - 1) * safeLimit, include: { patient: { select: { firstName: true, lastName: true } }, wearableDevice: { select: { displayName: true, status: true, externalDeviceId: true } }, inventoryDevice: { select: { serialNumber: true, lot: { select: { manufacturer: true } } } }, plan: true, invoice: { select: { status: true, balanceDue: true } } } }),
      db.wearableLot.findMany({ where: { clinicId }, orderBy: { receivedAt: 'desc' }, take: safeLimit, skip: (safePage - 1) * safeLimit, include: { devices: { select: { status: true } }, plan: true } }),
      db.wearableLot.count({ where: { clinicId } }),
    ]);
    const now = Date.now();
    return {
      plans,
      summary: { totalDevices, available, assigned, subscriptionsDue: await db.wearableSubscription.count({ where: { patient: { clinicId }, status: { in: ['PENDING_PAYMENT', 'OVERDUE'] } } }) },
      subscriptions: { items: subscriptions.map((subscription) => ({ ...subscription, daysRemaining: Math.max(0, Math.ceil((new Date(subscription.periodEndAt).getTime() - now) / 86_400_000)) })), total: await db.wearableSubscription.count({ where: { patient: { clinicId } } }), page: safePage, limit: safeLimit },
      lots: { items: lots, total: totalLots, page: safePage, limit: safeLimit },
    };
  }

  /** Reception sees only the minimum required to hand over an available Aulia watch. */
  async getReceptionDashboard(page = 1, limit = 10, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const dashboard = await this.getInventoryDashboard(page, limit, actor.id);
    const availableDevices = await this.prisma.wearableInventoryDevice.findMany({
      where: { status: 'AVAILABLE', revokedAt: null, provisionedAt: { not: null }, lot: { clinicId: actor.clinicId } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(10, Math.max(1, limit)),
      select: { serialNumber: true, platform: true, lot: { select: { manufacturer: true } } },
    });
    return { ...dashboard, availableDevices };
  }

  async pairDeviceAtReception(body: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const patientId = String(body?.patientId || '').trim();
    const assetCode = String(body?.assetCode || '').trim().toUpperCase();
    if (!patientId || !assetCode) throw new BadRequestException('Sélectionnez un patient et scannez le code Aulia de la montre.');
    if (!assetCode.startsWith('AULIA-')) throw new ForbiddenException('Code non reconnu : seules les montres Aulia Care provisionnées peuvent être attribuées.');
    const inventory = await this.prisma.wearableInventoryDevice.findFirst({
      where: { serialNumber: assetCode, lot: { clinicId: actor.clinicId } }, include: { lot: true },
    });
    if (!inventory) throw new ForbiddenException('Cette montre ne fait pas partie du parc Aulia Care. Distribution refusée.');
    if (inventory.status !== 'AVAILABLE' || inventory.revokedAt || !inventory.provisionedAt) throw new BadRequestException('Cette montre Aulia est indisponible, révoquée ou non encore provisionnée.');
    return this.registerDevice({ patientId, externalDeviceId: inventory.serialNumber, manufacturer: inventory.lot.manufacturer, platform: inventory.platform, displayName: `Montre ${inventory.lot.manufacturer === 'APPLE' ? 'Apple Watch' : 'Samsung Galaxy Watch'} Aulia` }, actorId);
  }

  private async refreshSubscriptionStates(clinicId: string) {
    const db = this.prisma;
    const now = new Date();
    // A payment is the only event that can reactivate a patient watch.  The UI
    // never controls the device state directly.
    const paidSubscriptions = await db.wearableSubscription.findMany({
      where: {
        patient: { clinicId },
        status: { in: ['PENDING_PAYMENT', 'OVERDUE'] },
        periodEndAt: { gt: now },
        invoice: { status: 'PAID' },
      },
      select: { id: true, wearableDeviceId: true },
    });
    if (paidSubscriptions.length) {
      await this.prisma.$transaction(async (tx) => {
        await tx.wearableSubscription.updateMany({
          where: { id: { in: paidSubscriptions.map((item) => item.id) }, patient: { clinicId } },
          data: { status: 'ACTIVE', paidAt: now },
        });
        await tx.wearableDevice.updateMany({
          where: { id: { in: paidSubscriptions.map((item) => item.wearableDeviceId) }, patient: { clinicId } },
          data: { status: 'ACTIVE' },
        });
      });
    }
    const overdue = await db.wearableSubscription.findMany({ where: { patient: { clinicId }, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] }, periodEndAt: { lt: now } }, select: { id: true, wearableDeviceId: true } });
    if (!overdue.length) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.wearableSubscription.updateMany({ where: { id: { in: overdue.map((item) => item.id) }, patient: { clinicId } }, data: { status: 'OVERDUE' } });
      await tx.wearableDevice.updateMany({ where: { id: { in: overdue.map((item) => item.wearableDeviceId) }, patient: { clinicId } }, data: { status: 'SUSPENDED' } });
    });
  }

  async registerDevice(body: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const patientId = String(body?.patientId || '');
    const externalDeviceId = String(body?.externalDeviceId || '').trim();
    if (!patientId || !externalDeviceId || !body?.manufacturer || !body?.platform) {
      throw new BadRequestException('patientId, fabricant, plateforme et identifiant externe sont requis.');
    }
    const manufacturer = String(body.manufacturer).toUpperCase();
    const platform = String(body.platform).toUpperCase();
    const inventory = await this.prisma.wearableInventoryDevice.findFirst({
      where: { serialNumber: externalDeviceId.toUpperCase(), lot: { clinicId: actor.clinicId } },
      include: { lot: { include: { plan: true } } },
    });
    if (!inventory || inventory.status !== 'AVAILABLE' || inventory.revokedAt || !inventory.provisionedAt || inventory.lot.manufacturer !== manufacturer || inventory.platform !== platform || !inventory.lot.plan?.active) {
      throw new ForbiddenException('Cette montre n’est pas une montre Aulia disponible, approuvée et compatible.');
    }
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: actor.clinicId, deletedAt: null },
      select: { id: true, clinicId: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');

    const periodStartAt = new Date();
    const periodEndAt = new Date(periodStartAt.getTime() + 30 * 86_400_000);
    const device = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({ data: { patientId, issuedById: actor.id, clinicId: actor.clinicId, type: 'OTHER', status: 'ISSUED', totalAmount: inventory.lot.plan.monthlyPrice, balanceDue: inventory.lot.plan.monthlyPrice, dueDate: periodStartAt, remarks: `Abonnement mensuel montre ${manufacturer} Aulia` } });
      const created = await tx.wearableDevice.create({ data: { patientId, inventoryDeviceId: inventory.id, externalDeviceId: inventory.serialNumber, manufacturer: manufacturer as 'APPLE' | 'SAMSUNG', platform: platform as 'WATCHOS' | 'WEAR_OS', displayName: body.displayName?.trim() || null, esimPhoneNumber: body.esimPhoneNumber?.trim() || null, status: 'SUSPENDED' } });
      await tx.wearableSubscription.create({ data: { patientId, wearableDeviceId: created.id, inventoryDeviceId: inventory.id, planId: inventory.lot.plan.id, status: 'PENDING_PAYMENT', amount: inventory.lot.plan.monthlyPrice, currency: 'CDF', periodStartAt, periodEndAt, invoiceId: invoice.id } });
      const claimed = await tx.wearableInventoryDevice.updateMany({ where: { id: inventory.id, status: 'AVAILABLE', lot: { clinicId: actor.clinicId } }, data: { status: 'ASSIGNED', assignedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('Cette montre vient d’être attribuée. Réessayez avec une autre montre.');
      return created;
    });
    this.gateway.notifyPatientEvent(patientId, 'wearable.device.registered', { deviceId: device.id, at: new Date().toISOString() });
    return device;
  }

  async createParentChildLink(body: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const parentUserId = String(body?.parentUserId || '');
    const childPatientId = String(body?.childPatientId || '');
    if (!parentUserId || !childPatientId) throw new BadRequestException('Le parent et l enfant sont requis.');
    const [parent, child] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: parentUserId, primaryRole: 'PATIENT', status: 'ACTIVE', deletedAt: null }, select: { id: true, status: true } }),
      this.prisma.patient.findFirst({ where: { id: childPatientId, clinicId: actor.clinicId, deletedAt: null }, select: { id: true } }),
    ]);
    if (!parent || parent.status !== 'ACTIVE' || !child) throw new NotFoundException('Parent ou enfant introuvable.');
    const parentPatient = await this.prisma.patient.findFirst({
      where: { portalUserId: parent.id, clinicId: actor.clinicId, deletedAt: null },
      select: { id: true },
    });
    if (!parentPatient) throw new ForbiddenException('Le parent sélectionné n’est pas rattaché à cet établissement.');
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const link = await this.prisma.parentChildLink.upsert({
      where: { parentUserId_childPatientId: { parentUserId, childPatientId } },
      create: { parentUserId, childPatientId, tokenHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
      update: { tokenHash, status: 'PENDING', expiresAt: new Date(Date.now() + 15 * 60 * 1000), acceptedAt: null, revokedAt: null },
    });
    await this.prisma.auditTrail.create({ data: { actorId: actor.id, entity: 'ParentChildLink', entityId: link.id, action: 'CREATE', after: { clinicId: actor.clinicId, childPatientId, parentUserId, expiresAt: link.expiresAt } } });
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
    const linkedChildren = await this.prisma.parentChildLink.findMany({
      where: { parentUserId, status: 'ACTIVE', revokedAt: null },
      select: { child: { select: { clinicId: true } } },
    });
    const clinicIds = [...new Set(linkedChildren.map((link) => link.child.clinicId).filter((clinicId): clinicId is string => Boolean(clinicId)))];
    await Promise.all(clinicIds.map((clinicId) => this.refreshSubscriptionStates(clinicId)));
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
    const actor = await this.requireClinic(actorId);
    const device = await this.prisma.wearableDevice.findFirst({
      where: { id: deviceId, patient: { clinicId: actor.clinicId, deletedAt: null } },
      include: { patient: true },
    });
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
    const patient = await this.resolvePatientAccess(patientId, requester);
    const requesterId = requester?.userId || requester?.id;
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
    const actor = await this.requireClinic(actorId);
    const device = await this.prisma.wearableDevice.findFirst({
      where: { id: deviceId, patient: { clinicId: actor.clinicId, deletedAt: null } },
    });
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
    const access = await this.resolvePatientAccess(patientId, requester);
    if (!access.clinicId) throw new ForbiddenException('Le dossier patient doit être rattaché à un établissement.');
    await this.refreshSubscriptionStates(access.clinicId);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: access.clinicId, deletedAt: null },
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
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, deletedAt: null, clinicId: { not: null } },
      select: { clinicId: true },
    });
    if (!patient?.clinicId) return;
    const recipients = await this.prisma.user.findMany({ where: { clinicId: patient.clinicId, status: 'ACTIVE', deletedAt: null, primaryRole: { in: ['NURSE', 'PHYSICIAN', 'ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
    await Promise.all(recipients.map(async ({ id }) => {
      const notification = await this.prisma.notification.create({ data: { patientId, recipientId: id, type: 'ALERT', priority: 'CRITICAL', title: 'Alerte clinique critique', message: `${reason}. Évaluation humaine immédiate requise.`, relatedEntity: 'WearableMeasurement', relatedId: measurementId } });
      this.gateway.notifyToUser(id, 'clinical.alert', notification);
    }));
  }
}
