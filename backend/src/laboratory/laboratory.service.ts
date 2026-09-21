// backend/src/laboratory/laboratory.service.ts

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ClinicContextService } from '../core/clinic-context.service';

type LabTestParameterRef = {
  name?: string | null;
  unit?: string | null;
  referenceRange?: string | null;
  minValue?: string | null;
  maxValue?: string | null;
};

type RawResultParameter = {
  id?: string;
  labTestParameter?: LabTestParameterRef | null;
  valueNumeric?: number | string | null;
  valueText?: string | null;
  interpretation?: string | null;
};

type LabRequestSummaryShape = {
  id: string;
  displayId?: string;
  patient?: { firstName?: string | null; lastName?: string | null } | null;
  status?: string | null;
  priority?: string | null;
  requestedAt?: Date | string | null;
  items?: any[];
  results?: any[];
  specimenType?: string | null;
};

type LabResultLite = {
  resultStatus?: string | null;
  reportedAt?: Date | string | null;
  id?: string;
  parameters?: RawResultParameter[];
  interpretation?: string | null;
  comments?: string | null;
};

type LabRequestItemLite = {
  id?: string;
  assignedTo?: { id?: string; displayName?: string | null; firstName?: string | null; lastName?: string | null } | null;
  assignedToId?: string | null;
  labRequestId?: string;
  status?: string | null;
  results?: LabResultLite[] | null;
  labTestId?: string | null;
  labTest?: { name?: string | null; unit?: string | null; referenceRange?: string | null } | null;
  requestedAt?: string | Date | null;
  analysisStartedAt?: string | Date | null;
  completedAt?: string | Date | null;
  labRequest?: { priority?: string | null; patient?: { firstName?: string | null; lastName?: string | null } } | null;
};

const normalizeResultParameters = (parameters: RawResultParameter[]) =>
  parameters.map((parameter) => ({
    id: parameter.id,
    name: parameter.labTestParameter?.name || 'Parametre',
    value: parameter.valueNumeric?.toString() || parameter.valueText || null,
    unit: parameter.labTestParameter?.unit || null,
    referenceRange: parameter.labTestParameter?.referenceRange || null,
    interpretation: parameter.interpretation || null,
    outOfRange: isOutOfRange(parameter),
  }));

const isOutOfRange = (parameter: RawResultParameter) => {
  const value = Number(parameter.valueNumeric);
  if (!Number.isFinite(value)) return false;
  const min = Number(parameter.labTestParameter?.minValue);
  const max = Number(parameter.labTestParameter?.maxValue);
  if (Number.isFinite(min) && value < min) return true;
  if (Number.isFinite(max) && value > max) return true;
  return false;
};

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private requireClinic(actorId?: string) {
    return this.clinicContext.requireOperationalActor({ userId: actorId });
  }

  private async technicianDirectReleaseEnabled(clinicId: string) {
    const config = await this.prisma.labConfiguration.findUnique({
      where: {
        clinicId_key: {
          clinicId,
          key: 'technicianDirectRelease',
        },
      },
    });
    const value = config?.value as { enabled?: boolean } | undefined;
    return Boolean(value?.enabled);
  }

  async getSettings(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return {
      technicianDirectRelease: await this.technicianDirectReleaseEnabled(actor.clinicId),
    };
  }

  async updateSettings(dto: { technicianDirectRelease?: boolean }, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const enabled = Boolean(dto?.technicianDirectRelease);
    await this.prisma.labConfiguration.upsert({
      where: {
        clinicId_key: {
          clinicId: actor.clinicId,
          key: 'technicianDirectRelease',
        },
      },
      update: {
        value: { enabled },
        description: 'Autorise les techniciens laboratoire à envoyer un résultat valide directement au demandeur.',
      },
      create: {
        clinicId: actor.clinicId,
        key: 'technicianDirectRelease',
        value: { enabled },
        description: 'Autorise les techniciens laboratoire à envoyer un résultat valide directement au demandeur.',
      },
    });
    return this.getSettings(actorId);
  }

  async setDirectResultAuthorization(
    dto: { technicianDirectRelease?: boolean },
    actorId?: string,
  ) {
    return this.updateSettings(dto, actorId);
  }

  async findAll(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.labRequest.findMany({
      where: {
        clinicId: actor.clinicId,
        deletedAt: null,
        OR: [
          { externalReference: null },
          { status: { not: 'REQUESTED' as any } },
        ],
      },
      include: {
        patient: true,
        requestedBy: true,
        consultation: { include: { provider: true } },
        items: {
          include: {
            labTest: {
              include: {
                category: true,
                section: true,
                parameterTemplates: true,
                sampleRequirements: { include: { labSampleType: true } },
                consumableRequirements: {
                  include: {
                    labConsumable: {
                      include: {
                        stock: {
                          where: {
                            clinicId: actor.clinicId,
                            archivedAt: null,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            assignedTo: true,
            samples: { include: { labSampleType: true } },
            results: { include: { parameters: { include: { labTestParameter: true } }, reportedBy: true } },
          },
        },
        results: { include: { reportedBy: true }, orderBy: { reportedAt: 'desc' } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findOne(id: string, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const request = await this.prisma.labRequest.findFirst({
      where: { id, clinicId: actor.clinicId, deletedAt: null },
      include: {
        patient: true,
        requestedBy: true,
        consultation: { include: { provider: true } },
        items: {
          include: {
            labTest: {
              include: {
                category: true,
                section: true,
                parameterTemplates: true,
                sampleRequirements: { include: { labSampleType: true } },
                consumableRequirements: {
                  include: {
                    labConsumable: {
                      include: {
                        stock: {
                          where: {
                            clinicId: actor.clinicId,
                            archivedAt: null,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            assignedTo: true,
            samples: { include: { labSampleType: true } },
            results: { include: { parameters: { include: { labTestParameter: true } }, reportedBy: true } },
          },
        },
        results: { include: { reportedBy: true }, orderBy: { reportedAt: 'desc' } },
      },
    });
    if (!request) {
      throw new NotFoundException('Demande de laboratoire introuvable');
    }

    const visibilityWhere = await this.buildLabRequestVisibilityWhere(actor.clinicId);
    const isVisible = await this.prisma.labRequest.findFirst({
      where: { id, ...visibilityWhere },
      select: { id: true },
    });

    if (!isVisible) {
      throw new NotFoundException('Demande de laboratoire introuvable');
    }

    return request;
  }

  async findCatalogue(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const clinicId = actor.clinicId;

    const [sections, categories, tests, sampleTypes, consumables] = await Promise.all([
      this.prisma.labSection.findMany({
        where: { clinicId, active: true },
        include: {
          categories: { where: { clinicId, active: true }, select: { id: true } },
          tests: { where: { clinicId, active: true }, select: { id: true } },
        },
        orderBy: { order: 'asc' },
      }),
      this.prisma.labCategory.findMany({
        where: { clinicId, active: true },
        include: {
          section: true,
          tests: { where: { clinicId, active: true }, select: { id: true } },
        },
        orderBy: { order: 'asc' },
      }),
      this.prisma.labTest.findMany({
        where: { clinicId, active: true },
        include: {
          category: true,
          section: true,
          parameterTemplates: { where: { clinicId, active: true, archivedAt: null } },
          sampleRequirements: {
            where: { clinicId, archivedAt: null },
            include: { labSampleType: true },
          },
          consumableRequirements: {
            where: { clinicId, archivedAt: null },
            include: { labConsumable: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.labSampleType.findMany({
        where: { clinicId, active: true },
        include: {
          sampleRequirements: {
            where: { clinicId, archivedAt: null },
            include: { labTest: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.labConsumable.findMany({
        where: { clinicId, active: true },
        include: {
          stock: {
            where: {
              clinicId,
              archivedAt: null,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { sections, categories, tests, sampleTypes, consumables };
  }

  /**
   * Compatibility endpoint for the existing frontend. ClinicLabTest no longer
   * exists in persistence: the returned wrapper is derived from the clinic-owned LabTest.
   */
  async getClinicLabTests(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const tests = await this.prisma.labTest.findMany({
      where: { clinicId: actor.clinicId, active: true },
      include: {
        category: true,
        section: true,
        parameterTemplates: { where: { clinicId: actor.clinicId, active: true, archivedAt: null } },
        sampleRequirements: {
          where: { clinicId: actor.clinicId, archivedAt: null },
          include: { labSampleType: true },
        },
        consumableRequirements: {
          where: { clinicId: actor.clinicId, archivedAt: null },
          include: { labConsumable: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return tests.map((labTest) => ({
      id: labTest.id,
      clinicId: actor.clinicId,
      labTestId: labTest.id,
      active: labTest.active,
      price: labTest.price,
      turnaroundTimeMinutes: labTest.turnaroundTimeMinutes,
      labTest,
    }));
  }

  /** Compatibility update: local configuration now lives directly on LabTest. */
  async configureClinicLabTest(
    labTestId: string,
    dto: { active?: boolean; price?: number | null; turnaroundTimeMinutes?: number | null },
    actorId?: string,
  ) {
    const actor = await this.requireClinic(actorId);
    const existing = await this.prisma.labTest.findFirst({
      where: { id: labTestId, clinicId: actor.clinicId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Examen de laboratoire introuvable dans cet établissement.');

    const price = dto.price === undefined || dto.price === null ? dto.price : Number(dto.price);
    const turnaroundTimeMinutes = dto.turnaroundTimeMinutes === undefined || dto.turnaroundTimeMinutes === null
      ? dto.turnaroundTimeMinutes
      : Number(dto.turnaroundTimeMinutes);

    if (price !== undefined && price !== null && (!Number.isFinite(price) || price < 0)) {
      throw new BadRequestException('Le tarif laboratoire doit être un nombre positif ou nul.');
    }
    if (turnaroundTimeMinutes !== undefined && turnaroundTimeMinutes !== null && (!Number.isInteger(turnaroundTimeMinutes) || turnaroundTimeMinutes <= 0)) {
      throw new BadRequestException('Le délai laboratoire doit être exprimé en minutes entières strictement positives.');
    }

    const labTest = await this.prisma.labTest.update({
      where: { id: existing.id },
      data: { active: dto.active, price, turnaroundTimeMinutes, updatedById: actor.id },
      include: { category: true, section: true },
    });

    return {
      id: labTest.id,
      clinicId: actor.clinicId,
      labTestId: labTest.id,
      active: labTest.active,
      price: labTest.price,
      turnaroundTimeMinutes: labTest.turnaroundTimeMinutes,
      labTest,
    };
  }

  private async getClinicLabTestConfigMap(clinicId: string, labTestIds: string[]) {
    const uniqueLabTestIds = Array.from(new Set(labTestIds.filter(Boolean)));
    if (uniqueLabTestIds.length === 0) {
      return new Map<string, { active: boolean; price: number | null; turnaroundTimeMinutes: number | null }>();
    }

    const tests = await this.prisma.labTest.findMany({
      where: { clinicId, id: { in: uniqueLabTestIds } },
      select: { id: true, active: true, price: true, turnaroundTimeMinutes: true },
    });

    return new Map(tests.map((test) => [
      test.id,
      {
        active: test.active,
        price: test.price === null ? null : Number(test.price),
        turnaroundTimeMinutes: test.turnaroundTimeMinutes,
      },
    ]));
  }

  private async buildLabRequestVisibilityWhere(clinicId: string) {
    const paidInvoices = await this.prisma.invoice.findMany({
      where: { clinicId, type: 'LABORATORY', status: 'PAID' },
      select: { id: true, remarks: true },
    });

    const paidInvoiceIds = paidInvoices.map((invoice) => invoice.id);
    const ids: string[] = [];
    const remarkRegex = /(?:LabRequest|Demande laboratoire):?\s*([a-zA-Z0-9-]+)/gi;

    for (const invoice of paidInvoices) {
      const text = String(invoice.remarks || '');
      for (const match of text.matchAll(remarkRegex)) {
        if (match && match[1]) ids.push(match[1]);
      }
    }

    const paidRequestIds = Array.from(new Set(ids)).filter(Boolean);
    const paidInvoiceConditions: any[] = [];

    if (paidInvoiceIds.length > 0) {
      paidInvoiceConditions.push({ externalReference: { in: paidInvoiceIds } });
    }
    if (paidRequestIds.length > 0) {
      paidInvoiceConditions.push({ id: { in: paidRequestIds } });
    }

    if (paidInvoiceConditions.length === 0) {
      return { clinicId, deletedAt: null, id: { in: [] } };
    }

    return {
      clinicId,
      deletedAt: null,
      OR: paidInvoiceConditions,
    };
  }

  private async buildLabReferenceCode(
  clinicId: string,
  patient:
    | {
        firstName?: string | null;
        lastName?: string | null;
        createdAt?: Date | string;
      }
    | null
    | undefined,
  requestStatus: string,
  resultStatus?: string | null,
) {
  const patientNumber = patient?.createdAt
    ? (await this.prisma.patient.count({
        where: {
          clinicId,
          createdAt: {
            lt: new Date(patient.createdAt),
          },
        },
      })) + 1
    : 1;

  const firstNameInitial =
    String(patient?.firstName || '').trim().charAt(0).toUpperCase() || 'X';

  const lastNameInitial =
    String(patient?.lastName || '').trim().charAt(0).toUpperCase() || 'X';

  let suffix = 'LABD';

  if (
    [
      'TECHNICAL_VALIDATION',
      'BIOLOGICAL_VALIDATION',
      'AVAILABLE',
      'SENT',
      'COMPLETED',
      'VERIFIED',
    ].includes(requestStatus)
  ) {
    suffix = 'LABV';
  } else if (
    ['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS'].includes(
      requestStatus,
    )
  ) {
    suffix = 'LABD';
  }

  if (
    resultStatus &&
    ['PENDING', 'CORRECTION_REQUESTED'].includes(resultStatus)
  ) {
    suffix = 'LABA';
  } else if (
    resultStatus &&
    ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(resultStatus)
  ) {
    suffix = 'LABV';
  }

  return `${patientNumber}AU-${firstNameInitial}${lastNameInitial}${suffix}`;
}

  async getActivityOverview(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const visibilityWhere = await this.buildLabRequestVisibilityWhere(actor.clinicId);
    const [
      recentRequests,
      lowStockEntries,
      assignedItems,
      technicianDirectRelease,
    ] = await Promise.all([
      this.prisma.labRequest.findMany({
        where: visibilityWhere,
        include: {
          patient: true,
          requestedBy: true,
          consultation: { include: { provider: true } },
          items: { include: { labTest: true, assignedTo: true } },
          samples: { include: { labSampleType: true } },
          results: true,
        },
        orderBy: { requestedAt: 'desc' },
        take: 20,
      }),
      this.prisma.labConsumableStock.findMany({
        where: { clinicId: actor.clinicId, archivedAt: null },
        include: { labConsumable: true },
      }),
      this.prisma.labRequestItem.findMany({
        where: {
          deletedAt: null,
          assignedToId: { not: null },
          labRequest: visibilityWhere,
        },
        include: { assignedTo: true, labTest: true, labRequest: { include: { patient: true } } },
      }),
      this.technicianDirectReleaseEnabled(actor.clinicId),
    ]);

    const [totalRequests, pendingRequests, validationQueueCount, technicalValidationCount, biologicalValidationCount, sampleCollectedCount, sampleReceivedCount] =
      await Promise.all([
        this.prisma.labRequest.count({ where: visibilityWhere }),
        this.prisma.labRequest.count({
          where: {
            ...visibilityWhere,
            status: { in: ['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS'] },
          },
        }),
        this.prisma.labResult.count({
          where: { deletedAt: null, resultStatus: 'PENDING', labRequest: { clinicId: actor.clinicId, deletedAt: null } },
        }),
        this.prisma.labResult.count({
          where: { deletedAt: null, resultStatus: 'TECHNICAL_VALIDATED', labRequest: { clinicId: actor.clinicId, deletedAt: null } },
        }),
        this.prisma.labResult.count({
          where: { deletedAt: null, resultStatus: 'BIOLOGICALLY_VALIDATED', labRequest: { clinicId: actor.clinicId, deletedAt: null } },
        }),
        this.prisma.labSample.count({
          where: {
            deletedAt: null,
            status: { in: ['COLLECTED', 'IN_TRANSIT', 'RECEIVED', 'STORED'] },
            labRequest: { clinicId: actor.clinicId, deletedAt: null },
          },
        }),
        this.prisma.labSample.count({
          where: { deletedAt: null, status: 'RECEIVED', labRequest: { clinicId: actor.clinicId, deletedAt: null } },
        }),
      ]);

    const technicianMap = new Map<
      string,
      { technician: string; assignedItems: number; openItems: number }
    >();

    assignedItems.forEach((item) => {
      const it = item as unknown as LabRequestItemLite;
      if (!it.assignedTo) {
        return;
      }
      const technicianName =
        it.assignedTo.displayName ||
        [it.assignedTo.firstName, it.assignedTo.lastName].filter(Boolean).join(' ') ||
        'Technicien';
      const technicianId = it.assignedTo.id || 'unknown';
      const existing = technicianMap.get(technicianId) ?? {
        technician: technicianName,
        assignedItems: 0,
        openItems: 0,
      };
      existing.assignedItems += 1;
      if (['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS', 'TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION'].includes(String(it.status || '')) ) {
        existing.openItems += 1;
      }
      technicianMap.set(technicianId, existing);
    });

    const lowStockAlerts = lowStockEntries
      .filter(
        (stock) =>
          stock.labConsumable &&
          ((stock.minimumLevel !== null && stock.quantity <= stock.minimumLevel) ||
            (stock.criticalLevel !== null && stock.quantity <= stock.criticalLevel)),
      )
      .map((stock) => ({
        consumableName: stock.labConsumable.name,
        location: stock.location || 'Non renseignée',
        quantity: stock.quantity.toString(),
        minimumLevel: stock.minimumLevel?.toString() ?? null,
        criticalLevel: stock.criticalLevel?.toString() ?? null,
      }));

    const criticalAlerts = [] as Array<{ title: string; message: string; priority: string; createdAt: string; displayId?: string }>;
    for (const request of recentRequests.filter((item) => ['URGENT', 'CRITICAL'].includes((item.priority || '').toUpperCase())).slice(0, 5)) {
      const displayId = await this.buildLabReferenceCode(
        actor.clinicId,
        request.patient,
        request.status,
        request.results?.[0]?.resultStatus,
      );
      criticalAlerts.push({
        title: `Demande urgente ${displayId}`,
        message: `${[request.patient?.firstName, request.patient?.lastName].filter(Boolean).join(' ') || 'Patient inconnu'} • ${request.specimenType || 'Examen'}`,
        priority: request.priority || 'URGENT',
        createdAt: request.requestedAt.toISOString(),
        displayId,
      });
    }

    const recentRequestSummaries = [] as Array<{
      id: string;
      displayId: string;
      patientName: string;
      status?: string | null;
      priority: string;
      requestedAt?: string | null;
      resultSentAt?: string | null;
      assignedTo?: string | null;
      specimenType: string;
    }>;
    for (const request of recentRequests) {
      const assignedItem = request.items?.find((item) => item.assignedTo);
      const assignedTo = assignedItem
        ? assignedItem.assignedTo.displayName ||
          [assignedItem.assignedTo.firstName, assignedItem.assignedTo.lastName].filter(Boolean).join(' ')
        : null;
      const latestResult = [...(request.results ?? [])].reduce<any | null>((latest, result) => {
        const resultTime = result.reportedAt ? new Date(result.reportedAt).getTime() : 0;
        if (!latest || resultTime > new Date(latest.reportedAt).getTime()) {
          return result;
        }
        return latest;
      }, null);
      const resultSentAt = request.sentAt || request.completedAt || latestResult?.reportedAt;
      const displayId = await this.buildLabReferenceCode(
        actor.clinicId,
        request.patient,
        request.status,
        request.results?.[0]?.resultStatus,
      );
      recentRequestSummaries.push({
        id: request.id,
        displayId,
        patientName: [request.patient?.firstName, request.patient?.lastName].filter(Boolean).join(' ') || 'Patient inconnu',
        status: request.status,
        priority: request.priority || 'NORMAL',
        requestedAt: request.requestedAt.toISOString(),
        resultSentAt: resultSentAt ? new Date(resultSentAt).toISOString() : null,
        assignedTo,
        specimenType: request.specimenType || 'N/A',
      });
    }

    return {
      totalRequests,
      pendingRequests,
      validationQueueCount,
      technicalValidationCount,
      biologicalValidationCount,
      sampleCollectedCount,
      sampleReceivedCount,
      technicianWorkloads: Array.from(technicianMap.values()).sort((a, b) => b.openItems - a.openItems),
      lowStockAlerts,
      criticalAlerts,
      recentRequests: recentRequestSummaries,
      technicianDirectRelease,
    };
  }

  async getDashboardOverview(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const now = new Date();

    const visibilityWhere = await this.buildLabRequestVisibilityWhere(actor.clinicId);
    const requests = await this.prisma.labRequest.findMany({
      where: visibilityWhere,
      include: {
        items: {
          include: {
            labTest: true,
            results: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    const dashboardLabTestIds = requests
      .flatMap((request) => request.items || [])
      .map((item) => item.labTestId)
      .filter((labTestId): labTestId is string => Boolean(labTestId));
    const clinicLabTestConfigMap = await this.getClinicLabTestConfigMap(
      actor.clinicId,
      dashboardLabTestIds,
    );

    const paidLaboratoryInvoices = await this.prisma.invoice.findMany({
      where: {
        clinicId: actor.clinicId,
        type: 'LABORATORY',
        status: 'PAID',
      },
      select: {
        totalAmount: true,
        issuedAt: true,
      },
    });

    const revenueToday = paidLaboratoryInvoices
      .filter((invoice) => invoice.issuedAt >= today && invoice.issuedAt < tomorrow)
      .reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
    const totalRevenue = paidLaboratoryInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.totalAmount || 0),
      0,
    );

    const todayRequests = requests.filter((request) => request.requestedAt >= today && request.requestedAt < tomorrow);
    const todayItems = todayRequests.flatMap((request) => request.items || []);
    const processedToday = todayItems.filter((item) => {
      const normalizedStatus = String(item.status || '').toUpperCase();
      const hasValidatedResult = (item.results || []).some((result: LabResultLite) => ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(String(result.resultStatus || '').toUpperCase()));
      return ['COMPLETED', 'AVAILABLE', 'SENT', 'VERIFIED'].includes(normalizedStatus) || hasValidatedResult;
    }).length;

    const pendingItems = requests.flatMap((request) => request.items || []).filter((item) => {
      const it = item as unknown as LabRequestItemLite;
      const normalizedStatus = String(it.status || '').toUpperCase();
      const hasValidatedResult = (it.results || []).some((result: LabResultLite) => ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(String(result.resultStatus || '').toUpperCase()));
      return !['COMPLETED', 'AVAILABLE', 'SENT', 'VERIFIED'].includes(normalizedStatus) && !hasValidatedResult;
    });

    const validatedToday = requests.filter((request) => request.sentAt && request.sentAt >= today && request.sentAt < tomorrow).length;
    const overdueItems = requests.flatMap((request) => request.items || []).filter((item) => {
      const it = item as unknown as LabRequestItemLite;
      const turnaroundMinutes = Number(
        (it.labTestId ? clinicLabTestConfigMap.get(it.labTestId)?.turnaroundTimeMinutes : null) || 0,
      );
      if (!turnaroundMinutes || !it.requestedAt) {
        return false;
      }
      const requestedAtTime = new Date(it.requestedAt as any).getTime();
      const deadline = new Date(requestedAtTime + turnaroundMinutes * 60000);
      const normalizedStatus = String(it.status || '').toUpperCase();
      const hasValidatedResult = (it.results || []).some((result: LabResultLite) => ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(String(result.resultStatus || '').toUpperCase()));
      return now > deadline && !['COMPLETED', 'AVAILABLE', 'SENT', 'VERIFIED'].includes(normalizedStatus) && !hasValidatedResult;
    });


    const workflow = requests.reduce((acc, request) => {
      const key = this.translateWorkflowStatus(request.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const validations = await this.getValidations(actorId, 'LAB_MANAGER');
    const performance = {
      value: requests.length > 0 ? Number(((processedToday / Math.max(todayRequests.length, 1)) * 100).toFixed(1)) : 0,
      processedToday,
      requestsToday: todayRequests.length,
    };

    const topTests = requests.flatMap((request) => request.items || []).reduce((acc, item) => {
      const name = item.labTest?.name || 'Analyse';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const staffPerformance = await this.prisma.labRequestItem.findMany({
      where: {
        deletedAt: null,
        assignedToId: { not: null },
        labRequest: {
          clinicId: actor.clinicId,
          deletedAt: null,
        },
      },
      include: {
        assignedTo: true,
        results: true,
      },
    });

    const staffMap = new Map<string, { name: string; total: number; validated: number }>();
    staffPerformance.forEach((item) => {
      const technician = item.assignedTo;
      if (!technician) {
        return;
      }
      const entry = staffMap.get(technician.id) || { name: technician.displayName || [technician.firstName, technician.lastName].filter(Boolean).join(' ') || 'Technicien', total: 0, validated: 0 };
      entry.total += 1;
      const hasSuccessfulValidation = (item.results || []).some((result: any) => ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(String(result.resultStatus || '').toUpperCase()));
      if (hasSuccessfulValidation) {
        entry.validated += 1;
      }
      staffMap.set(technician.id, entry);
    });

    const inventory = await this.prisma.labConsumableStock.findMany({
      where: { clinicId: actor.clinicId, archivedAt: null },
      include: { labConsumable: true },
      orderBy: { lastUpdatedAt: 'desc' },
    });

    const quality = {
      validationsCount: requests.flatMap((request) => request.items || []).reduce((sum, item) => sum + ((item.results || []).some((result: any) => ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(String(result.resultStatus || '').toUpperCase())) ? 1 : 0), 0),
      sentCount: requests.filter((request) => request.sentAt && request.sentAt >= today && request.sentAt < tomorrow).length,
    };

    const recentActivity = await this.prisma.labRequestEvent.findMany({
      where: {
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
        labRequest: {
          clinicId: actor.clinicId,
          deletedAt: null,
        },
      },
      include: {
        labRequest: {
          include: {
            patient: true,
          },
        },
        labRequestItem: {
          include: {
            labTest: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    const activity = await this.getActivityOverview(actorId);

    const alerts = [
      ...(activity.criticalAlerts || []),
      ...(activity.lowStockAlerts || []).map((alert) => ({
        title: 'Stock laboratoire critique',
        message: `${alert.consumableName} - ${alert.quantity} restant(s)`,
        priority: 'HIGH',
        meta: alert.location,
        createdAt: new Date().toISOString(),
      })),
    ];

    return {
      requestsToday: todayRequests.length,
      examsToday: processedToday,
      resultsPending: pendingItems.length,
      resultsValidatedToday: validatedToday,
      overdue: overdueItems.length,
      revenueToday,
      workflow,
      alerts,
      validations: validations.items || [],
      performance,
      topTests: Object.entries(topTests).map(([testName, count]) => ({ testName, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      staffPerformance: Array.from(staffMap.values()).map((entry) => ({
        ...entry,
        percent: entry.total ? Number(((entry.validated / entry.total) * 100).toFixed(1)) : 0,
      })).sort((a, b) => b.percent - a.percent),
      inventory: inventory.map((stock) => ({
        id: stock.id,
        name: stock.labConsumable?.name || 'Consommable',
        quantity: Number(stock.quantity || 0),
        minimumLevel: Number(stock.minimumLevel || 0),
        percent: stock.minimumLevel ? Number((Number(stock.quantity || 0) / Number(stock.minimumLevel)) * 100) : (Number(stock.quantity || 0) > 0 ? 100 : 0),
      })),
      revenue: { total: totalRevenue },
      quality,
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        when: entry.createdAt?.toISOString(),
        description: `${entry.action || 'Activité'} • ${entry.labRequest?.patient ? `${entry.labRequest.patient.firstName} ${entry.labRequest.patient.lastName}`.trim() : 'Patient inconnu'} • ${entry.labRequestItem?.labTest?.name || 'Analyse'}`,
      })),
    };
  }

  async getDashboardWorkflow(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const visibilityWhere = await this.buildLabRequestVisibilityWhere(actor.clinicId);
    const groups = await this.prisma.labRequest.groupBy({
      by: ['status'],
      where: visibilityWhere,
      _count: { _all: true },
    });
    return groups.reduce((acc, item) => {
      acc[this.translateWorkflowStatus(item.status)] = item._count._all;
      return acc;
    }, {} as Record<string, number>);
  }

  async getDashboardAlerts(actorId?: string) {
    const activity = await this.getActivityOverview(actorId);
    return [
      ...activity.criticalAlerts,
      ...activity.lowStockAlerts.map((alert) => ({
        title: 'Stock laboratoire critique',
        message: `${alert.consumableName} - ${alert.quantity} restant(s)`,
        priority: 'HIGH',
        meta: alert.location,
        createdAt: new Date().toISOString(),
      })),
    ];
  }

  private translateWorkflowStatus(status?: string | null) {
    const normalized = String(status || '').toUpperCase();
    const labels: Record<string, string> = {
      REQUESTED: 'Demandée',
      COLLECTED: 'Collectée',
      RECEIVED: 'Reçue',
      IN_ANALYSIS: 'En analyse',
      TECHNICAL_VALIDATION: 'Validation technique',
      BIOLOGICAL_VALIDATION: 'Validation biologique',
      AVAILABLE: 'Disponible',
      SENT: 'Envoyée',
      COMPLETED: 'Terminée',
      VERIFIED: 'Vérifiée',
      CANCELLED: 'Annulée',
    };
    return labels[normalized] || normalized;
  }

  async repairMissingLabRequestItems(clinicId: string) {
    const requestsWithoutItems = await this.prisma.labRequest.findMany({
      where: { clinicId, deletedAt: null, items: { none: {} } },
      include: { items: true, patient: true, consultation: true },
    });

    for (const request of requestsWithoutItems) {
      const trimmedSpecimen = request.specimenType?.trim();
      if (!trimmedSpecimen) continue;

      let labTest = await this.prisma.labTest.findFirst({
        where: {
          clinicId,
          active: true,
          OR: [
            { name: { equals: trimmedSpecimen, mode: 'insensitive' } },
            { code: { equals: trimmedSpecimen, mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
      });

      if (!labTest) {
        labTest = await this.prisma.labTest.findFirst({
          where: { clinicId, active: true, name: { contains: trimmedSpecimen, mode: 'insensitive' } },
          orderBy: { name: 'asc' },
        });
      }

      if (labTest) {
        await this.prisma.labRequestItem.create({
          data: {
            labRequestId: request.id,
            labTestId: labTest.id,
            status: 'REQUESTED',
            requestedAt: request.requestedAt,
            specimenLabel: request.specimenType || labTest.name,
          },
        });
      }
    }
  }

  async getTechnicians(currentUser?: any) {
    const actor = await this.requireClinic(currentUser?.userId || currentUser?.id);
    const labDepartment = await this.prisma.department.findFirst({
      where: {
        clinicId: actor.clinicId,
        OR: [
          { name: { equals: 'Laboratoire Medical', mode: 'insensitive' } },
          { name: { equals: 'Laboratoire Médical', mode: 'insensitive' } },
          { name: { contains: 'laboratoire', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true },
    });

    const labDepartmentId = labDepartment?.id;
    const responsibleUserIds = new Set<string>();

    if (labDepartmentId) {
      const departmentResponsibles = await this.prisma.departmentResponsable.findMany({
        where: { departmentId: labDepartmentId, actif: true },
        select: { userId: true },
      });
      departmentResponsibles.forEach((responsible) => responsibleUserIds.add(responsible.userId));
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(startOfDay);
    startOfMonth.setDate(1);

    await this.repairMissingLabRequestItems(actor.clinicId);

    const visibilityWhere = await this.buildLabRequestVisibilityWhere(actor.clinicId);
    const visibleRequestIds = new Set(
      (await this.prisma.labRequest.findMany({ where: visibilityWhere, select: { id: true } })).map((request) => request.id),
    );

    const [staffRecords, assignedItems, requestEvents] = await Promise.all([
      labDepartmentId
        ? this.prisma.employee.findMany({
            where: {
              departmentId: labDepartmentId,
              status: 'ACTIVE',
              user: {
                clinicId: actor.clinicId,
                status: 'ACTIVE',
                deletedAt: null,
                primaryRole: 'LAB_TECHNICIAN',
              },
            },
            include: {
              department: true,
              user: {
                include: {
                  serviceResponsabilites: { include: { service: true } },
                  departmentResponsibilities: { where: { actif: true }, include: { department: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      this.prisma.labRequestItem.findMany({
        where: { deletedAt: null, assignedToId: { not: null }, labRequest: visibilityWhere },
        include: {
          assignedTo: true,
          labRequest: { include: { patient: true } },
          labTest: true,
          results: true,
          events: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      }),
      this.prisma.labRequestEvent.findMany({
        where: { labRequestItemId: { not: null }, labRequest: visibilityWhere },
        include: {
          performedBy: true,
          labRequest: { include: { patient: true } },
          labRequestItem: { include: { labTest: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    const technicianLabTestIds = assignedItems
      .map((item: any) => item.labTestId)
      .filter((labTestId: unknown): labTestId is string => typeof labTestId === 'string' && Boolean(labTestId));
    const technicianClinicLabTestConfigMap = await this.getClinicLabTestConfigMap(
      actor.clinicId,
      technicianLabTestIds,
    );

    const technicians = await Promise.all(
      staffRecords
        .filter((record: any) => {
          const user = record.user;
          const isResponsible = responsibleUserIds.has(user?.id || '');
          return !!user && user.primaryRole === 'LAB_TECHNICIAN' && user.status === 'ACTIVE' && !isResponsible;
        })
        .map(async (record: any) => {
          const user = record.user;
          const technicianItems = assignedItems.filter((item: any) => item.assignedToId === user.id && visibleRequestIds.has(item.labRequestId));
          const statusList = (item: any) => (item.status || '').toUpperCase();
          const resultStatusList = (result: any) => (result.resultStatus || '').toUpperCase();

          const pendingCount = technicianItems.filter((item: any) => ['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS', 'TECHNICAL_VALIDATION'].includes(statusList(item))).length;
          const inProgressCount = technicianItems.filter((item: any) => ['IN_ANALYSIS', 'TECHNICAL_VALIDATION'].includes(statusList(item))).length;
          const completedCount = technicianItems.filter((item: any) => ['COMPLETED', 'BIOLOGICAL_VALIDATION', 'RESULT_READY', 'BIOLOGICALLY_VALIDATED', 'VERIFIED', 'AVAILABLE'].includes(statusList(item))).length;
          const validatedCount = technicianItems.filter((item: any) => (item.results || []).some((result: any) => ['BIOLOGICALLY_VALIDATED', 'VERIFIED', 'AVAILABLE'].includes(resultStatusList(result)))).length;
          const correctionCount = technicianItems.filter((item: any) => (item.results || []).some((result: any) => ['CORRECTION_REQUESTED'].includes(resultStatusList(result)))).length;
          const rejectedCount = technicianItems.filter((item: any) => (item.results || []).some((result: any) => ['REJECTED'].includes(resultStatusList(result)))).length;
          const urgentCount = technicianItems.filter((item: any) => ['URGENT', 'CRITICAL'].includes((item.labRequest?.priority || '').toUpperCase())).length;
          const lastActivity = requestEvents.find((event: any) => event.labRequestItemId && technicianItems.some((item: any) => item.id === event.labRequestItemId))?.createdAt || user.lastLoginAt || user.updatedAt;

          const processingDurations: number[] = [];
          const receptionToStartDurations: number[] = [];
          const analysisDurations: number[] = [];
          let delayedCount = 0;
          let dailyProductivity = 0;
          let weeklyProductivity = 0;
          let monthlyProductivity = 0;

          technicianItems.forEach((item: any) => {
            const requestedAt = item.requestedAt ? new Date(item.requestedAt).getTime() : null;
            const startedAt = item.analysisStartedAt ? new Date(item.analysisStartedAt).getTime() : null;
            const completedAt = item.completedAt ? new Date(item.completedAt).getTime() : null;
            const turnaroundMinutes = item.labTestId
              ? technicianClinicLabTestConfigMap.get(item.labTestId)?.turnaroundTimeMinutes ?? null
              : null;

            if (requestedAt && startedAt) {
              receptionToStartDurations.push((startedAt - requestedAt) / 60000);
            }
            if (startedAt && completedAt) {
              analysisDurations.push((completedAt - startedAt) / 60000);
            }
            if (requestedAt && completedAt) {
              processingDurations.push((completedAt - requestedAt) / 60000);
              if (turnaroundMinutes && completedAt - requestedAt > turnaroundMinutes * 60000) {
                delayedCount += 1;
              }
            }
            if (completedAt && completedAt >= startOfDay.getTime()) {
              dailyProductivity += 1;
            }
            if (completedAt && completedAt >= startOfWeek.getTime()) {
              weeklyProductivity += 1;
            }
            if (completedAt && completedAt >= startOfMonth.getTime()) {
              monthlyProductivity += 1;
            }
          });

          const avgProcessingMinutes = processingDurations.length ? processingDurations.reduce((sum, value) => sum + value, 0) / processingDurations.length : 0;
          const avgReceptionToStartMinutes = receptionToStartDurations.length ? receptionToStartDurations.reduce((sum, value) => sum + value, 0) / receptionToStartDurations.length : 0;
          const avgAnalysisMinutes = analysisDurations.length ? analysisDurations.reduce((sum, value) => sum + value, 0) / analysisDurations.length : 0;
          const successRate = completedCount ? validatedCount / completedCount : 0;
          const rejectionRate = completedCount ? rejectedCount / completedCount : 0;
          const delayRate = completedCount ? delayedCount / completedCount : 0;
          const productivityLevel = weeklyProductivity >= 5 ? 'Élevée' : weeklyProductivity >= 2 ? 'Moyenne' : 'Faible';
          const history = requestEvents
            .filter((event: any) => event.labRequestItemId && technicianItems.some((item: any) => item.id === event.labRequestItemId))
            .map((event: any) => ({
              id: event.id,
              action: event.action,
              createdAt: event.createdAt,
              note: event.note,
              patientName: [event.labRequest?.patient?.firstName, event.labRequest?.patient?.lastName].filter(Boolean).join(' ') || 'Patient inconnu',
              testName: event.labRequestItem?.labTest?.name || 'Analyse',
              status: event.toStatus || event.fromStatus || 'N/A',
            }))
            .slice(0, 20);

          return {
            id: user.id,
            fullName: user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' '),
            matricule: user.username,
            function: user.specialty || 'Technicien laboratoire',
            laboratory: record.service?.name || 'Laboratoire',
            team: record.service?.name || 'Équipe laboratoire',
            status: user.status === 'ACTIVE' ? 'Connecté' : 'Absent',
            availability: pendingCount <= 3 ? 'Disponible' : 'Chargé',
            lastActivityAt: lastActivity,
            workload: {
              pending: pendingCount,
              inProgress: inProgressCount,
              completed: completedCount,
              validated: validatedCount,
              corrections: correctionCount,
              rejected: rejectedCount,
              urgent: urgentCount,
            },
            performance: {
              totalAnalyses: technicianItems.length,
              completedAnalyses: completedCount,
              acceptedValidations: validatedCount,
              rejectedValidations: rejectedCount,
              correctionRequests: correctionCount,
              averageProcessingHours: Number((avgProcessingMinutes / 60).toFixed(1)),
              averageReceptionToStartHours: Number((avgReceptionToStartMinutes / 60).toFixed(1)),
              averageAnalysisHours: Number((avgAnalysisMinutes / 60).toFixed(1)),
              delayRate: Number(delayRate.toFixed(2)),
              successRate: Number(successRate.toFixed(2)),
              rejectionRate: Number(rejectionRate.toFixed(2)),
              dailyProductivity,
              weeklyProductivity,
              monthlyProductivity,
              productivityLevel,
            },
            assignedItems: technicianItems.map((item: any) => ({
              id: item.id,
              requestId: item.labRequest?.id,
              patientName: [item.labRequest?.patient?.firstName, item.labRequest?.patient?.lastName].filter(Boolean).join(' ') || 'Patient inconnu',
              testName: item.labTest?.name || 'Analyse',
              status: item.status,
              priority: item.labRequest?.priority || 'NORMAL',
            })),
            history,
            reassignments: history.filter((event: any) => event.action === 'TECHNICIAN_REASSIGNED'),
            refusedValidations: technicianItems.flatMap((item: any) => (item.results || []).filter((result: any) => ['REJECTED'].includes((result.resultStatus || '').toUpperCase())).map((result: any) => ({
              id: result.id,
              patientName: [item.labRequest?.patient?.firstName, item.labRequest?.patient?.lastName].filter(Boolean).join(' ') || 'Patient inconnu',
              testName: item.labTest?.name || 'Analyse',
              decisionDate: result.reportedAt || item.completedAt,
              reason: result.comments || result.interpretation || 'Non renseigné',
              observations: result.interpretation || result.comments || 'Aucune observation',
            }))),
          };
        }),
    );

    const unassignedItems = await this.prisma.labRequestItem.findMany({
      where: { deletedAt: null, assignedToId: null, labRequest: visibilityWhere },
      include: {
        labRequest: { include: { patient: true } },
        labTest: true,
        results: true,
        events: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { requestedAt: 'desc' },
    });
    const pendingUnassignedItems = unassignedItems.filter((item: any) => {
      const hasValidatedResult = (item.results || []).some((result: any) => ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED', 'VERIFIED', 'AVAILABLE', 'SENT', 'COMPLETED'].includes((result.resultStatus || '').toUpperCase()));
      return !hasValidatedResult;
    });

    return {
      technicians: technicians.sort((a, b) => b.workload.pending - a.workload.pending),
      unassignedItems: pendingUnassignedItems.map((item: any) => ({
        id: item.id,
        requestId: item.labRequest?.id,
        patientName: [item.labRequest?.patient?.firstName, item.labRequest?.patient?.lastName].filter(Boolean).join(' ') || 'Patient inconnu',
        testName: item.labTest?.name || 'Analyse',
        status: item.status,
        requestedAt: item.requestedAt,
        priority: item.labRequest?.priority || 'NORMAL',
      })),
    };
  }

  async assignTechnician(itemId: string, dto: { technicianId: string; note?: string }, currentUser?: any) {
    const actor = await this.requireClinic(currentUser?.userId || currentUser?.id);
    const item = await this.prisma.labRequestItem.findFirst({
      where: { id: itemId, labRequest: { clinicId: actor.clinicId, deletedAt: null } },
      include: { labRequest: true },
    });
    if (!item) throw new NotFoundException('Analyse introuvable dans cet établissement.');

    const technician = await this.prisma.user.findFirst({
      where: {
        id: dto.technicianId,
        clinicId: actor.clinicId,
        primaryRole: 'LAB_TECHNICIAN',
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!technician) throw new BadRequestException('Technicien de laboratoire introuvable dans cet établissement.');

    const claimed = await this.prisma.labRequestItem.updateMany({
      where: {
        id: itemId,
        assignedToId: null,
        status: { notIn: ['CANCELLED', 'AVAILABLE', 'SENT'] as any },
        labRequest: { clinicId: actor.clinicId, deletedAt: null },
      },
      data: {
        assignedToId: technician.id,
        status: item.status === 'REQUESTED' ? 'RECEIVED' : item.status,
        updatedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Cette analyse vient déjà d’être attribuée ou n’est plus disponible. Actualisez la liste.');
    }
    const updated = await this.prisma.labRequestItem.findFirstOrThrow({
      where: { id: itemId, labRequest: { clinicId: actor.clinicId, deletedAt: null } },
    });

    await this.prisma.labRequestEvent.create({
      data: {
        labRequestId: item.labRequestId,
        labRequestItemId: item.id,
        action: 'TECHNICIAN_ASSIGNED',
        fromStatus: item.status,
        toStatus: updated.status,
        performedById: actor.id,
        note: dto.note || 'Analyse attribuée au technicien',
        createdAt: new Date(),
      },
    });

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: technician.id,
        type: 'TASK',
        status: 'UNREAD',
        priority: item.labRequest?.priority === 'CRITICAL' ? 'CRITICAL' : item.labRequest?.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
        title: 'Analyse laboratoire attribuée',
        message: 'Une analyse vous a été attribuée. Les autres techniciens la verront en lecture seule.',
        relatedEntity: 'LabRequestItem',
        relatedId: item.id,
        sendAt: new Date(),
      },
    });
    this.notificationsGateway.notifyToUser(technician.id, 'notification.created', notification);
    this.notificationsGateway.notify('lab.item.assigned', {
      itemId: item.id,
      labRequestId: item.labRequestId,
      technicianId: technician.id,
      assignedById: actor.id,
    });
    return updated;
  }

  async reassignTechnician(itemId: string, dto: { technicianId: string; reason?: string }, currentUser?: any) {
    const actor = await this.requireClinic(currentUser?.userId || currentUser?.id);
    const item = await this.prisma.labRequestItem.findFirst({
      where: { id: itemId, labRequest: { clinicId: actor.clinicId, deletedAt: null } },
      include: { labRequest: true, assignedTo: true },
    });
    if (!item) throw new NotFoundException('Analyse introuvable dans cet établissement.');

    const technician = await this.prisma.user.findFirst({
      where: {
        id: dto.technicianId,
        clinicId: actor.clinicId,
        primaryRole: 'LAB_TECHNICIAN',
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!technician) throw new BadRequestException('Technicien de laboratoire introuvable dans cet établissement.');

    const changed = await this.prisma.labRequestItem.updateMany({
      where: {
        id: itemId,
        status: { notIn: ['CANCELLED', 'AVAILABLE', 'SENT'] as any },
        labRequest: { clinicId: actor.clinicId, deletedAt: null },
      },
      data: { assignedToId: technician.id, updatedAt: new Date() },
    });
    if (changed.count !== 1) throw new BadRequestException('Cette analyse ne peut plus être réaffectée.');

    const updated = await this.prisma.labRequestItem.findFirstOrThrow({
      where: { id: itemId, labRequest: { clinicId: actor.clinicId, deletedAt: null } },
    });
    await this.prisma.labRequestEvent.create({
      data: {
        labRequestId: item.labRequestId,
        labRequestItemId: item.id,
        action: 'TECHNICIAN_REASSIGNED',
        fromStatus: item.status,
        toStatus: updated.status,
        performedById: actor.id,
        note: dto.reason || 'Analyse réaffectée',
        createdAt: new Date(),
      },
    });
    this.notificationsGateway.notify('lab.item.assigned', {
      itemId: item.id,
      labRequestId: item.labRequestId,
      previousTechnicianId: item.assignedToId,
      technicianId: technician.id,
      assignedById: actor.id,
    });
    return { item: updated, previousTechnicianId: item.assignedToId, newTechnicianId: technician.id };
  }

  async createSection(dto: { name: string; description?: string; order?: string; active?: boolean }, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Le nom de la section est obligatoire.');
    const duplicate = await this.prisma.labSection.findFirst({ where: { clinicId: actor.clinicId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
    if (duplicate) throw new BadRequestException('Une section portant ce nom existe déjà dans cet établissement.');
    return this.prisma.labSection.create({ data: { clinicId: actor.clinicId, name, description: dto.description?.trim() || undefined, order: dto.order ? Number(dto.order) || 0 : 0, active: dto.active ?? true } });
  }

  async updateCatalogue(
    kind: 'sections' | 'categories' | 'tests' | 'sample-types' | 'consumables' | 'test-parameters' | 'sample-requirements' | 'consumable-requirements',
    id: string,
    dto: any,
    actorId?: string,
  ) {
    const actor = await this.requireClinic(actorId);
    const clinicId = actor.clinicId;

    const ensure = async (model: any) => {
      const row = await model.findFirst({ where: { id, clinicId }, select: { id: true } });
      if (!row) throw new NotFoundException('Élément de catalogue introuvable dans cet établissement.');
      return row;
    };

    if (kind === 'sections') {
      await ensure(this.prisma.labSection);
      return this.prisma.labSection.update({ where: { id }, data: { name: dto.name?.trim(), description: dto.description === undefined ? undefined : dto.description?.trim() || null, order: dto.order === undefined ? undefined : Number(dto.order) || 0, active: dto.active } });
    }
    if (kind === 'categories') {
      await ensure(this.prisma.labCategory);
      if (dto.sectionId) {
        const section = await this.prisma.labSection.findFirst({ where: { id: dto.sectionId, clinicId }, select: { id: true } });
        if (!section) throw new BadRequestException('Section laboratoire invalide pour cet établissement.');
      }
      return this.prisma.labCategory.update({ where: { id }, data: { sectionId: dto.sectionId, name: dto.name?.trim(), code: dto.code === undefined ? undefined : dto.code?.trim() || null, description: dto.description === undefined ? undefined : dto.description?.trim() || null, order: dto.order === undefined ? undefined : Number(dto.order) || 0, active: dto.active } });
    }
    if (kind === 'sample-types') {
      await ensure(this.prisma.labSampleType);
      return this.prisma.labSampleType.update({ where: { id }, data: { name: dto.name?.trim(), description: dto.description === undefined ? undefined : dto.description?.trim() || null, active: dto.active } });
    }
    if (kind === 'consumables') {
      await ensure(this.prisma.labConsumable);
      return this.prisma.labConsumable.update({ where: { id }, data: { name: dto.name?.trim(), code: dto.code?.trim(), description: dto.description === undefined ? undefined : dto.description?.trim() || null, unit: dto.unit?.trim(), active: dto.active } });
    }
    if (kind === 'test-parameters') {
      await ensure(this.prisma.labTestParameter);
      if (dto.labTestId) {
        const test = await this.prisma.labTest.findFirst({ where: { id: dto.labTestId, clinicId }, select: { id: true } });
        if (!test) throw new BadRequestException('Examen laboratoire invalide pour cet établissement.');
      }
      return this.prisma.labTestParameter.update({ where: { id }, data: { labTestId: dto.labTestId || undefined, code: dto.code?.trim(), name: dto.name?.trim(), unit: dto.unit?.trim() || undefined, resultType: dto.resultType ? dto.resultType as any : undefined, referenceRange: dto.referenceRange?.trim() || undefined, minValue: dto.minValue === undefined || dto.minValue === '' ? undefined : Number(dto.minValue), maxValue: dto.maxValue === undefined || dto.maxValue === '' ? undefined : Number(dto.maxValue), criticalLow: dto.criticalLow === undefined || dto.criticalLow === '' ? undefined : Number(dto.criticalLow), criticalHigh: dto.criticalHigh === undefined || dto.criticalHigh === '' ? undefined : Number(dto.criticalHigh), method: dto.method?.trim() || undefined, order: dto.order === undefined ? undefined : Number(dto.order) || 0, active: dto.active } });
    }
    if (kind === 'sample-requirements') {
      await ensure(this.prisma.labTestSampleRequirement);
      if (dto.labTestId) {
        const test = await this.prisma.labTest.findFirst({ where: { id: dto.labTestId, clinicId }, select: { id: true } });
        if (!test) throw new BadRequestException('Examen laboratoire invalide pour cet établissement.');
      }
      if (dto.labSampleTypeId) {
        const sample = await this.prisma.labSampleType.findFirst({ where: { id: dto.labSampleTypeId, clinicId }, select: { id: true } });
        if (!sample) throw new BadRequestException('Type d’échantillon invalide pour cet établissement.');
      }
      return this.prisma.labTestSampleRequirement.update({ where: { id }, data: { labTestId: dto.labTestId || undefined, labSampleTypeId: dto.labSampleTypeId || undefined, volumeRequired: dto.volumeRequired === undefined || dto.volumeRequired === '' ? undefined : Number(dto.volumeRequired), volumeUnit: dto.volumeUnit?.trim() || undefined, storageCondition: dto.storageCondition?.trim() || undefined, maxAgeMinutes: dto.maxAgeMinutes === undefined || dto.maxAgeMinutes === '' ? undefined : Number(dto.maxAgeMinutes), instructions: dto.instructions?.trim() || undefined } });
    }
    if (kind === 'consumable-requirements') {
      await ensure(this.prisma.labTestConsumableRequirement);
      if (dto.labTestId) {
        const test = await this.prisma.labTest.findFirst({ where: { id: dto.labTestId, clinicId }, select: { id: true } });
        if (!test) throw new BadRequestException('Examen laboratoire invalide pour cet établissement.');
      }
      if (dto.labConsumableId) {
        const consumable = await this.prisma.labConsumable.findFirst({ where: { id: dto.labConsumableId, clinicId }, select: { id: true } });
        if (!consumable) throw new BadRequestException('Consommable laboratoire invalide pour cet établissement.');
      }
      return this.prisma.labTestConsumableRequirement.update({ where: { id }, data: { labTestId: dto.labTestId || undefined, labConsumableId: dto.labConsumableId || undefined, quantity: dto.quantity === undefined || dto.quantity === '' ? undefined : Number(dto.quantity), unit: dto.unit?.trim() || undefined } });
    }

    await ensure(this.prisma.labTest);
    if (dto.categoryId) {
      const category = await this.prisma.labCategory.findFirst({ where: { id: dto.categoryId, clinicId }, select: { id: true, sectionId: true } });
      if (!category) throw new BadRequestException('Catégorie laboratoire invalide pour cet établissement.');
      if (dto.sectionId && category.sectionId !== dto.sectionId) throw new BadRequestException('La catégorie et la section doivent appartenir au même arbre laboratoire.');
    }
    return this.prisma.labTest.update({ where: { id }, data: { code: dto.code?.trim(), name: dto.name?.trim(), categoryId: dto.categoryId, sectionId: dto.sectionId, description: dto.description === undefined ? undefined : dto.description?.trim() || null, price: dto.price === undefined ? undefined : dto.price === null || dto.price === '' ? null : Number(dto.price), turnaroundTimeMinutes: dto.turnaroundTimeMinutes === undefined ? undefined : dto.turnaroundTimeMinutes === null || dto.turnaroundTimeMinutes === '' ? null : Number(dto.turnaroundTimeMinutes), unit: dto.unit === undefined ? undefined : dto.unit?.trim() || null, referenceRange: dto.referenceRange === undefined ? undefined : dto.referenceRange?.trim() || null, genderRestriction: dto.genderRestriction, minAge: dto.minAge === undefined ? undefined : Number(dto.minAge) || null, maxAge: dto.maxAge === undefined ? undefined : Number(dto.maxAge) || null, active: dto.active, updatedById: actor.id } });
  }

  private async archiveTestFromCatalogue(tx: any, id: string, clinicId: string) {
    const test = await tx.labTest.findFirst({ where: { id, clinicId }, select: { id: true, code: true } });
    if (!test) throw new NotFoundException('Examen de laboratoire introuvable dans cet établissement.');
    const archivedAt = new Date();
    await tx.labTest.update({ where: { id }, data: { active: false, code: `${test.code}__ARCHIVED__${id.slice(0, 8)}` } });
    await tx.labTestSampleRequirement.updateMany({ where: { clinicId, labTestId: id, archivedAt: null }, data: { archivedAt } });
    await tx.labTestConsumableRequirement.updateMany({ where: { clinicId, labTestId: id, archivedAt: null }, data: { archivedAt } });
    await tx.labTestParameter.updateMany({ where: { clinicId, labTestId: id, archivedAt: null }, data: { active: false, archivedAt } });
  }

  async deleteCatalogue(
    kind: 'sections' | 'categories' | 'tests' | 'sample-types' | 'consumables' | 'test-parameters' | 'sample-requirements' | 'consumable-requirements',
    id: string,
    actorId?: string,
  ) {
    const actor = await this.requireClinic(actorId);
    const clinicId = actor.clinicId;
    return this.prisma.$transaction(async (tx) => {
      const archivedAt = new Date();
      if (kind === 'tests') { await this.archiveTestFromCatalogue(tx, id, clinicId); return { archived: true, kind, id }; }
      if (kind === 'sections') {
        const row = await tx.labSection.findFirst({ where: { id, clinicId }, select: { id: true } });
        if (!row) throw new NotFoundException('Section laboratoire introuvable.');
        await tx.labSection.update({ where: { id }, data: { active: false } });
      } else if (kind === 'categories') {
        const row = await tx.labCategory.findFirst({ where: { id, clinicId }, select: { id: true } });
        if (!row) throw new NotFoundException('Catégorie laboratoire introuvable.');
        await tx.labCategory.update({ where: { id }, data: { active: false } });
      } else if (kind === 'sample-types') {
        const row = await tx.labSampleType.findFirst({ where: { id, clinicId }, select: { id: true } });
        if (!row) throw new NotFoundException('Type d’échantillon introuvable.');
        await tx.labSampleType.update({ where: { id }, data: { active: false } });
      } else if (kind === 'consumables') {
        const row = await tx.labConsumable.findFirst({ where: { id, clinicId }, select: { id: true } });
        if (!row) throw new NotFoundException('Consommable laboratoire introuvable.');
        await tx.labConsumable.update({ where: { id }, data: { active: false } });
      } else if (kind === 'test-parameters') {
        const row = await tx.labTestParameter.findFirst({ where: { id, clinicId }, select: { id: true } });
        if (!row) throw new NotFoundException('Paramètre laboratoire introuvable.');
        await tx.labTestParameter.update({ where: { id }, data: { active: false, archivedAt } });
      } else if (kind === 'sample-requirements') {
        const row = await tx.labTestSampleRequirement.findFirst({ where: { id, clinicId }, select: { id: true } });
        if (!row) throw new NotFoundException('Exigence d’échantillon introuvable.');
        await tx.labTestSampleRequirement.update({ where: { id }, data: { archivedAt } });
      } else {
        const row = await tx.labTestConsumableRequirement.findFirst({ where: { id, clinicId }, select: { id: true } });
        if (!row) throw new NotFoundException('Exigence de consommable introuvable.');
        await tx.labTestConsumableRequirement.update({ where: { id }, data: { archivedAt } });
      }
      return { archived: true, kind, id };
    });
  }

  async createCategory(dto: { sectionId?: string; name: string; code?: string; description?: string; order?: string; active?: boolean }, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    if (!dto.sectionId) throw new BadRequestException('La section laboratoire est obligatoire.');
    const section = await this.prisma.labSection.findFirst({ where: { id: dto.sectionId, clinicId: actor.clinicId, active: true }, select: { id: true } });
    if (!section) throw new BadRequestException('Section laboratoire introuvable dans cet établissement.');
    return this.prisma.labCategory.create({ data: { clinicId: actor.clinicId, sectionId: section.id, name: dto.name.trim(), code: dto.code?.trim() || undefined, description: dto.description?.trim() || undefined, order: dto.order ? Number(dto.order) || 0 : 0, active: dto.active ?? true } });
  }

  async createTest(dto: any, createdById?: string) {
    const actor = await this.requireClinic(createdById);
    const code = String(dto.code || '').trim();
    const testName = String(dto.name || '').trim();
    if (!code || !testName) throw new BadRequestException('Le code et le nom de l examen sont obligatoires.');

    const category = await this.prisma.labCategory.findFirst({ where: { id: dto.categoryId, clinicId: actor.clinicId, active: true }, select: { id: true, sectionId: true } });
    if (!category) throw new BadRequestException('Catégorie laboratoire introuvable dans cet établissement.');
    const sectionId = dto.sectionId || category.sectionId;
    const section = await this.prisma.labSection.findFirst({ where: { id: sectionId, clinicId: actor.clinicId, active: true }, select: { id: true } });
    if (!section || category.sectionId !== section.id) throw new BadRequestException('La catégorie et la section doivent appartenir au même établissement.');

    const duplicate = await this.prisma.labTest.findFirst({ where: { clinicId: actor.clinicId, OR: [{ code: { equals: code, mode: 'insensitive' } }, { name: { equals: testName, mode: 'insensitive' } }] }, select: { id: true } });
    if (duplicate) throw new BadRequestException('Un examen avec ce code ou ce nom existe déjà dans cet établissement.');

    const price = dto.price === undefined || dto.price === null || dto.price === '' ? null : Number(dto.price);
    const tat = dto.turnaroundTimeMinutes === undefined || dto.turnaroundTimeMinutes === null || dto.turnaroundTimeMinutes === '' ? null : Number(dto.turnaroundTimeMinutes);
    if (price !== null && (!Number.isFinite(price) || price < 0)) throw new BadRequestException('Le tarif laboratoire doit être positif ou nul.');
    if (tat !== null && (!Number.isInteger(tat) || tat <= 0)) throw new BadRequestException('Le délai laboratoire doit être exprimé en minutes entières strictement positives.');

    return this.prisma.$transaction(async (tx) => {
      const createdTest = await tx.labTest.create({ data: { clinicId: actor.clinicId, code, name: testName, categoryId: category.id, sectionId: section.id, description: dto.description?.trim() || undefined, price, turnaroundTimeMinutes: tat, resultType: dto.resultType as any, unit: dto.unit?.trim() || undefined, referenceRange: dto.referenceRange?.trim() || undefined, genderRestriction: dto.genderRestriction ? dto.genderRestriction as any : 'ALL', minAge: dto.minAge ? Number(dto.minAge) : undefined, maxAge: dto.maxAge ? Number(dto.maxAge) : undefined, active: dto.active ?? true, createdById: actor.id } });
      const isNfsPanel = /(^|\s)(nfs|hemogramme|num[eé]ration formule sanguine)(\s|$)/i.test(`${code} ${testName}`);
      if (isNfsPanel) {
        await tx.labTestParameter.createMany({ data: [
          ['GB','Globules Blancs','10^3/µL','4000-12000'],['NEUT','Neutrophiles','%','50-70'],['LYMPH','Lymphocytes','%','20-60'],['MONO','Monocytes','%','3-12'],['EOS','Éosinophiles','%','0.5-5'],['BASO','Basophiles','%','0.0-1.0'],['RDW','Globules Rouges','%','4.5-5.5 (H) / 4.0-5.0 (F)'],['HB','Hémoglobine','g/dL','12-16'],['HCT','Hématocrite','%','35-49'],['MCV','VGM','fL','80-100'],['CCM','CCM','pg','27-34'],['MCHC','CCMH','g/dL','31-37'],['PS','Plaquettes Sanguines','10^3/µL','100-300'],['VPM','VPM','fL','6.5-12'],['PTC','PTC','%','0.108-0.282']
        ].map(([parameterCode,name,unit,referenceRange],order) => ({ clinicId: actor.clinicId, labTestId: createdTest.id, code: parameterCode, name, unit, referenceRange, resultType: 'NUMERIC' as any, order })), skipDuplicates: true });
      }
      return createdTest;
    });
  }

  async createTestParameter(dto: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const test = await this.prisma.labTest.findFirst({ where: { id: dto.labTestId, clinicId: actor.clinicId, active: true }, select: { id: true } });
    if (!test) throw new BadRequestException('Examen laboratoire introuvable dans cet établissement.');
    return this.prisma.labTestParameter.create({ data: { clinicId: actor.clinicId, labTestId: test.id, code: dto.code.trim(), name: dto.name.trim(), unit: dto.unit?.trim() || undefined, resultType: dto.resultType ? dto.resultType as any : 'NUMERIC', referenceRange: dto.referenceRange?.trim() || undefined, minValue: dto.minValue || undefined, maxValue: dto.maxValue || undefined, criticalLow: dto.criticalLow || undefined, criticalHigh: dto.criticalHigh || undefined, method: dto.method?.trim() || undefined, order: dto.order ? Number(dto.order) || 0 : 0, active: dto.active ?? true } });
  }

  async createSampleType(dto: { name: string; description?: string; active?: boolean }, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.labSampleType.create({ data: { clinicId: actor.clinicId, name: dto.name.trim(), description: dto.description?.trim() || undefined, active: dto.active ?? true } });
  }

  async createSampleRequirement(dto: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const [test, sample] = await Promise.all([
      this.prisma.labTest.findFirst({ where: { id: dto.labTestId, clinicId: actor.clinicId, active: true }, select: { id: true } }),
      this.prisma.labSampleType.findFirst({ where: { id: dto.labSampleTypeId, clinicId: actor.clinicId, active: true }, select: { id: true } }),
    ]);
    if (!test || !sample) throw new BadRequestException('Examen et type d’échantillon doivent appartenir au même établissement.');
    return this.prisma.labTestSampleRequirement.create({ data: { clinicId: actor.clinicId, labTestId: test.id, labSampleTypeId: sample.id, volumeRequired: dto.volumeRequired || undefined, volumeUnit: dto.volumeUnit?.trim() || undefined, storageCondition: dto.storageCondition?.trim() || undefined, maxAgeMinutes: dto.maxAgeMinutes ? Number(dto.maxAgeMinutes) : undefined, instructions: dto.instructions?.trim() || undefined } });
  }

  async createConsumable(dto: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.labConsumable.create({ data: { clinicId: actor.clinicId, name: dto.name.trim(), code: dto.code.trim(), description: dto.description?.trim() || undefined, unit: dto.unit.trim(), active: dto.active ?? true } });
  }

  async createConsumableRequirement(dto: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const clinicId = actor.clinicId;
    const consumable = await this.prisma.labConsumable.findFirst({ where: { id: dto.labConsumableId, clinicId, active: true }, select: { id: true } });
    if (!consumable) throw new BadRequestException('Consommable laboratoire introuvable dans cet établissement.');

    if (dto.sectionId) {
      const section = await this.prisma.labSection.findFirst({ where: { id: dto.sectionId, clinicId, active: true }, select: { id: true } });
      if (!section) throw new BadRequestException('Section laboratoire introuvable dans cet établissement.');
      const tests = await this.prisma.labTest.findMany({ where: { clinicId, active: true, sectionId: section.id }, select: { id: true } });
      if (!tests.length) throw new BadRequestException('Aucun examen actif trouvé pour cette section.');
      const rows: Array<{ id: string }> = [];
      for (const test of tests) {
        const existing = await this.prisma.labTestConsumableRequirement.findFirst({ where: { clinicId, labTestId: test.id, labConsumableId: consumable.id, archivedAt: null }, select: { id: true } });
        if (existing) rows.push(await this.prisma.labTestConsumableRequirement.update({ where: { id: existing.id }, data: { quantity: dto.quantity, unit: dto.unit?.trim() || undefined } }));
        else rows.push(await this.prisma.labTestConsumableRequirement.create({ data: { clinicId, labTestId: test.id, labConsumableId: consumable.id, quantity: dto.quantity, unit: dto.unit?.trim() || undefined } }));
      }
      return rows;
    }

    if (!dto.labTestId) throw new BadRequestException('Un examen ou une section est requis.');
    const test = await this.prisma.labTest.findFirst({ where: { id: dto.labTestId, clinicId, active: true }, select: { id: true } });
    if (!test) throw new BadRequestException('Examen laboratoire introuvable dans cet établissement.');
    return this.prisma.labTestConsumableRequirement.create({ data: { clinicId, labTestId: test.id, labConsumableId: consumable.id, quantity: dto.quantity, unit: dto.unit?.trim() || undefined } });
  }

  async createConsumableStock(dto: any, updatedById?: string) {
    const actor = await this.requireClinic(updatedById);
    const consumable = await this.prisma.labConsumable.findFirst({ where: { id: dto.labConsumableId, clinicId: actor.clinicId, active: true }, select: { id: true } });
    if (!consumable) throw new NotFoundException('Consommable de laboratoire introuvable dans cet établissement.');
    return this.prisma.labConsumableStock.create({ data: { clinicId: actor.clinicId, labConsumableId: consumable.id, quantity: dto.quantity, minimumLevel: dto.minimumLevel || undefined, criticalLevel: dto.criticalLevel || undefined, location: dto.location?.trim() || undefined, lastUpdatedAt: new Date(), updatedById: actor.id } });
  }

  async updateConsumableStock(id: string, dto: any, updatedById?: string) {
    const actor = await this.requireClinic(updatedById);
    const stock = await this.prisma.labConsumableStock.findFirst({ where: { id, clinicId: actor.clinicId, archivedAt: null }, select: { id: true } });
    if (!stock) throw new NotFoundException('Stock de consommable de laboratoire introuvable.');
    return this.prisma.labConsumableStock.update({ where: { id: stock.id }, data: { ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}), ...(dto.minimumLevel !== undefined ? { minimumLevel: dto.minimumLevel || null } : {}), ...(dto.criticalLevel !== undefined ? { criticalLevel: dto.criticalLevel || null } : {}), ...(dto.location !== undefined ? { location: dto.location?.trim() || null } : {}), lastUpdatedAt: new Date(), updatedById: actor.id } });
  }

  async getValidations(currentUserId?: string, currentRole?: string) {
    const actor = await this.requireClinic(currentUserId);
    const where: any = {};
    const normalizedRole = String(currentRole || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (normalizedRole.includes('TECHNICIAN')) {
      where.items = { some: { assignedToId: currentUserId } };
    }

    const visibilityWhere = await this.buildLabRequestVisibilityWhere(actor.clinicId);
    const requests = await this.prisma.labRequest.findMany({
      where: {
        ...where,
        ...visibilityWhere,
      },
      include: {
        patient: true,
        consultation: { include: { provider: true } },
        items: {
          include: {
            labTest: true,
            assignedTo: true,
            results: {
              include: {
                reportedBy: true,
                parameters: { include: { labTestParameter: true } },
                technicalValidatedBy: true,
                biologicalValidatedBy: true,
              },
            },
          },
        },
        results: {
          include: {
            parameters: { include: { labTestParameter: true } },
            reportedBy: true,
            technicalValidatedBy: true,
            biologicalValidatedBy: true,
          },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });

    const items = requests.flatMap((request) => {
      const requestData: any = request;
      const requestItems = requestData.items || [];
      return requestItems.flatMap((item: any) => {
        const result = item.results?.[0];
        if (!result) return [];

        const resultData: any = result;
        const itemData: any = item;
        const patientData: any = requestData.patient;
        const normalizedResultStatus = String(resultData.resultStatus || '').toUpperCase();
        const normalizedRequestStatus = String(requestData.status || '').toUpperCase();
        const normalizedItemStatus = String(itemData.status || '').toUpperCase();
        const isPendingManagerDecision = normalizedResultStatus === 'PENDING'
          || normalizedResultStatus === 'TECHNICAL_VALIDATED'
          || (normalizedResultStatus === '' && ['TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION'].includes(normalizedRequestStatus));
        const isLockedForManagerDecision = ['BIOLOGICALLY_VALIDATED', 'AVAILABLE', 'SENT', 'VERIFIED', 'COMPLETED', 'REJECTED', 'CORRECTION_REQUESTED'].includes(normalizedResultStatus)
          || ['AVAILABLE', 'SENT', 'VERIFIED', 'COMPLETED'].includes(normalizedRequestStatus)
          || ['AVAILABLE', 'SENT'].includes(normalizedItemStatus);

        if (isLockedForManagerDecision || !isPendingManagerDecision) {
          return [];
        }

        return [{
          id: resultData.id,
          requestId: requestData.id,
          patientName: [patientData?.firstName, patientData?.lastName].filter(Boolean).join(' ') || 'Patient inconnu',
          testName: itemData.labTest?.name || 'Analyse',
          technicianName: itemData.assignedTo?.displayName || null,
          submittedAt: requestData.requestedAt,
          technicalValidationAt: resultData.technicalValidationAt,
          elapsedMinutes: resultData.technicalValidationAt ? Math.max(1, Math.round((Date.now() - new Date(resultData.technicalValidationAt).getTime()) / 60000)) : null,
          priority: requestData.priority,
          status: requestData.status,
          resultStatus: resultData.resultStatus,
          resultId: resultData.id,
          patientAge: patientData?.birthDate ? Math.floor((Date.now() - new Date(patientData.birthDate).getTime()) / 31557600000) : null,
          patientGender: patientData?.gender || null,
          prescriberName: requestData.consultation?.provider?.displayName || null,
          serviceName: null,
          prescriptionDate: requestData.requestedAt,
          rawParameters: (resultData.parameters || []).map((parameter: any) => ({
            id: parameter.id,
            name: 'Paramètre',
            value: parameter.valueNumeric?.toString() || parameter.valueText || null,
            unit: null,
            referenceRange: null,
            interpretation: parameter.interpretation || null,
            outOfRange: false,
          })),
          parameters: normalizeResultParameters(resultData.parameters || []),
          validations: [{
            id: `${resultData.id}-v1`,
            decision: resultData.resultStatus || 'PENDING',
            decisionDate: resultData.technicalValidationAt || resultData.biologicalValidationAt || resultData.reportedAt,
            validatorName: resultData.biologicalValidatedBy?.displayName || resultData.technicalValidatedBy?.displayName || null,
            technicianName: itemData.assignedTo?.displayName || null,
            comment: resultData.comments || null,
            observations: resultData.interpretation || null,
            instructions: resultData.interpretation || null,
            version: 1,
          }],
          decision: resultData.resultStatus ? {
            decision: resultData.resultStatus,
            decisionDate: resultData.biologicalValidationAt || resultData.technicalValidationAt || resultData.reportedAt,
            validatorName: resultData.biologicalValidatedBy?.displayName || resultData.technicalValidatedBy?.displayName || null,
            observations: resultData.interpretation || null,
            instructions: resultData.interpretation || null,
            reason: null,
          } : null,
        }];
      });
    });

    return {
      isManager: normalizedRole.includes('MANAGER') || normalizedRole === 'ADMIN',
      items,
    };
  }

  private isResultLocked(resultStatus?: string | null, requestStatus?: string | null, itemStatus?: string | null) {
    const normalizedResultStatus = `${resultStatus || ''}`.toUpperCase();
    const normalizedRequestStatus = `${requestStatus || ''}`.toUpperCase();
    const normalizedItemStatus = `${itemStatus || ''}`.toUpperCase();
    const lockedResultStatuses = new Set(['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED', 'AVAILABLE', 'SENT', 'VERIFIED', 'COMPLETED']);
    const lockedRequestStatuses = new Set(['AVAILABLE', 'SENT', 'VERIFIED', 'COMPLETED']);
    const lockedItemStatuses = new Set(['AVAILABLE', 'SENT']);

    return lockedResultStatuses.has(normalizedResultStatus)
      || lockedRequestStatuses.has(normalizedRequestStatus)
      || lockedItemStatuses.has(normalizedItemStatus);
  }

  private async consumeConsumablesForValidatedResult(tx: any, resultId: string, labRequestItemId: string | null, performedById?: string) {
    if (!labRequestItemId) return;

    const item = await tx.labRequestItem.findUnique({
      where: { id: labRequestItemId },
      select: {
        labTestId: true,
        labRequest: { select: { clinicId: true, deletedAt: true } },
      },
    });
    if (!item?.labTestId || !item.labRequest?.clinicId || item.labRequest.deletedAt) return;

    const clinicId = item.labRequest.clinicId;
    const reference = `lab-result:${resultId}`;
    const alreadyConsumed = await tx.labConsumableTransaction.count({
      where: { clinicId, reference, type: 'OUT' },
    });
    if (alreadyConsumed > 0) return;

    const requirements = await tx.labTestConsumableRequirement.findMany({
      where: { clinicId, labTestId: item.labTestId, archivedAt: null },
      include: { labConsumable: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const requirement of requirements) {
      const requiredQuantity = Number(requirement.quantity || 0);
      if (requiredQuantity <= 0) continue;

      const stockEntries = await tx.labConsumableStock.findMany({
        where: { clinicId, labConsumableId: requirement.labConsumableId, archivedAt: null },
        orderBy: [{ lastUpdatedAt: 'asc' }, { id: 'asc' }],
      });

      let remainingToConsume = requiredQuantity;
      for (const stockEntry of stockEntries) {
        if (remainingToConsume <= 0) break;
        const availableQuantity = Number(stockEntry.quantity || 0);
        if (availableQuantity <= 0) continue;
        const consumedQuantity = Math.min(availableQuantity, remainingToConsume);
        await tx.labConsumableStock.update({
          where: { id: stockEntry.id },
          data: {
            quantity: availableQuantity - consumedQuantity,
            lastUpdatedAt: new Date(),
            updatedById: performedById || null,
          },
        });
        await tx.labConsumableTransaction.create({
          data: {
            clinicId,
            labConsumableId: requirement.labConsumableId,
            type: 'OUT',
            quantity: consumedQuantity,
            unit: requirement.unit || requirement.labConsumable?.unit || 'unité',
            reference,
            note: 'Consommation liée à la validation du résultat de laboratoire',
            performedById: performedById || null,
          },
        });
        remainingToConsume -= consumedQuantity;
      }
      if (remainingToConsume > 0) {
        throw new BadRequestException(`Stock insuffisant pour ${requirement.labConsumable?.name || 'un consommable laboratoire'}.`);
      }
    }
  }

  async getCriticalAlerts(currentUser?: any) {
    const userId = currentUser?.userId || currentUser?.id;
    const actor = await this.requireClinic(userId);
    const role = String(currentUser?.primaryRole || '').toUpperCase();
    const where: any = { status: 'PENDING', labResult: { labRequest: { clinicId: actor.clinicId } } };
    if (role === 'PHYSICIAN') {
      where.labResult = { labRequest: { clinicId: actor.clinicId, OR: [{ requestedById: actor.id }, { consultation: { providerId: actor.id } }] } };
    }
    return this.prisma.labCriticalAlert.findMany({
      where,
      include: { patient: { select: { id: true, firstName: true, lastName: true } }, labResultParameter: true, labResult: { select: { resultName: true, labRequestId: true } } },
      orderBy: { detectedAt: 'desc' },
    });
  }

  async acknowledgeCriticalAlert(id: string, currentUser: any, note?: string) {
    const userId = currentUser?.userId || currentUser?.id;
    const actor = await this.requireClinic(userId);
    if (!userId) throw new BadRequestException('Utilisateur non identifié.');
    const alert = await this.prisma.labCriticalAlert.findFirst({
      where: { id, labResult: { labRequest: { clinicId: actor.clinicId } } },
      include: { labResult: { include: { labRequest: { include: { consultation: true } } } } },
    });
    if (!alert) throw new NotFoundException('Alerte critique introuvable.');
    const role = String(currentUser?.primaryRole || '').toUpperCase();
    const isClinicalOwner = alert.labResult.labRequest.requestedById === actor.id || alert.labResult.labRequest.consultation?.providerId === actor.id;
    if (role === 'PHYSICIAN' && !isClinicalOwner) throw new BadRequestException('Vous ne pouvez accuser réception que des alertes de vos patients.');
    const updated = await this.prisma.labCriticalAlert.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: actor.id, acknowledgementNote: note?.trim() || null },
    });
    this.notificationsGateway.notify('lab.critical-alert.acknowledged', { alertId: id, acknowledgedById: userId, acknowledgedAt: updated.acknowledgedAt });
    return updated;
  }

  /** Reverses exactly the recorded OUT movements; never deletes a stock movement. */
  /** Reverses exactly the recorded OUT movements; never deletes a stock movement. */
  private async reverseConsumablesForResult(tx: any, resultId: string, performedById?: string, reason?: string) {
    const result = await tx.labResult.findUnique({
      where: { id: resultId },
      select: { labRequest: { select: { clinicId: true, deletedAt: true } } },
    });
    const clinicId = result?.labRequest?.clinicId;
    if (!clinicId || result.labRequest.deletedAt) {
      throw new BadRequestException('Impossible de déterminer la clinique du résultat de laboratoire.');
    }

    const reference = `lab-result:${resultId}`;
    const reversalReference = `reversal:${reference}`;
    const alreadyReversed = await tx.labConsumableTransaction.count({
      where: { clinicId, reference: reversalReference, type: 'IN' },
    });
    if (alreadyReversed > 0) return;

    const movements = await tx.labConsumableTransaction.findMany({
      where: { clinicId, reference, type: 'OUT' },
      orderBy: { createdAt: 'asc' },
    });
    for (const movement of movements) {
      const stock = await tx.labConsumableStock.findFirst({
        where: { clinicId, labConsumableId: movement.labConsumableId, archivedAt: null },
        orderBy: [{ lastUpdatedAt: 'asc' }, { id: 'asc' }],
      });
      if (!stock) {
        throw new BadRequestException('Impossible d’annuler la consommation : aucun emplacement de stock actif ne peut recevoir le réactif.');
      }
      await tx.labConsumableStock.update({
        where: { id: stock.id },
        data: {
          quantity: Number(stock.quantity) + Number(movement.quantity),
          lastUpdatedAt: new Date(),
          updatedById: performedById || null,
        },
      });
      await tx.labConsumableTransaction.create({
        data: {
          clinicId,
          labConsumableId: movement.labConsumableId,
          type: 'IN',
          quantity: movement.quantity,
          unit: movement.unit,
          reference: reversalReference,
          note: `Annulation traçable de consommation — ${reason || 'résultat rejeté ou corrigé'}`,
          performedById: performedById || null,
        },
      });
    }
  }

  async applyValidationDecision(id: string, dto: any, currentUserId?: string) {
    const actor = await this.requireClinic(currentUserId);
    const result = await this.prisma.labResult.findFirst({
      where: { id, labRequest: { clinicId: actor.clinicId, deletedAt: null } },
      include: {
        labRequest: { include: { patient: true, consultation: true } },
        labRequestItem: true,
      },
    });
    if (!result) {
      throw new NotFoundException('Résultat introuvable');
    }

    const labRequest = await this.prisma.labRequest.findFirst({
      where: { id: result.labRequestId, clinicId: actor.clinicId, deletedAt: null },
      select: { status: true },
    });

    if (this.isResultLocked(result.resultStatus, labRequest?.status)) {
      throw new BadRequestException('Ce résultat a déjà été validé et transmis au médecin, il ne peut plus être modifié.');
    }

    const decision = dto.decision;
    let nextStatus = result.resultStatus;
    if (decision === 'VALIDATE') {
      nextStatus = 'BIOLOGICALLY_VALIDATED';
    } else if (decision === 'REJECT') {
      nextStatus = 'REJECTED';
    } else if (decision === 'CORRECTION') {
      nextStatus = 'CORRECTION_REQUESTED';
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedResult = await tx.labResult.update({
        where: { id },
        data: {
          resultStatus: nextStatus as any,
          biologicalValidationAt: new Date(),
          biologicalValidatedById: actor.id,
          comments: dto.observations || dto.reason || dto.instructions || null,
          interpretation: dto.observations || dto.reason || dto.instructions || null,
        },
      });

      if (decision === 'VALIDATE') {
        await this.consumeConsumablesForValidatedResult(tx, updatedResult.id, updatedResult.labRequestItemId, actor.id);

        const labRequest = await tx.labRequest.findUnique({
          where: { id: result.labRequestId },
          select: { id: true, requestedById: true, consultation: { select: { providerId: true } }, patient: { select: { id: true, firstName: true, lastName: true } } },
        });
        const recipientId = labRequest?.requestedById || labRequest?.consultation?.providerId;
        await tx.labRequest.update({
          where: { id: result.labRequestId },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        if (recipientId) {
          await tx.notification.create({
            data: {
              recipientId,
              patientId: labRequest?.patient?.id,
              type: 'ALERT',
              status: 'UNREAD',
              priority: 'HIGH',
              title: 'Résultat laboratoire envoyé',
              message: `Le résultat ${updatedResult.resultName} de ${labRequest?.patient?.firstName || ''} ${labRequest?.patient?.lastName || ''} a été envoyé au demandeur.`,
              relatedEntity: 'LabRequest',
              relatedId: result.labRequestId,
              sendAt: new Date(),
            },
          });
        }
      } else if (decision === 'REJECT' || decision === 'CORRECTION') {
        await this.reverseConsumablesForResult(tx, updatedResult.id, currentUserId, dto.reason || dto.instructions);
      }

      return updatedResult;
    });

    if (decision === 'VALIDATE') {
      await this.prisma.labRequest.update({
        where: { id: result.labRequestId },
        data: { status: 'AVAILABLE', completedAt: new Date(), sentAt: new Date() },
      });
      if (result.labRequestItemId) {
        await this.prisma.labRequestItem.update({
          where: { id: result.labRequestItemId },
          data: { status: 'AVAILABLE', completedAt: new Date() },
        });
      }

      const recipientId = result.labRequest.requestedById || result.labRequest.consultation?.providerId;
      if (recipientId) {
        const notification = await this.prisma.notification.create({
          data: {
            recipientId,
            patientId: result.labRequest.patientId,
            type: 'ALERT',
            status: 'UNREAD',
            priority: 'HIGH',
            title: 'Resultat laboratoire valide',
            message: `Le resultat ${result.resultName || result.labRequest.specimenType || 'laboratoire'} de ${result.labRequest.patient.firstName} ${result.labRequest.patient.lastName} est valide et disponible.`,
            relatedEntity: 'LabRequest',
            relatedId: result.labRequestId,
            sendAt: new Date(),
          },
        });
        this.notificationsGateway.notifyToUser(recipientId, 'notification.created', notification);
      }
    } else if (decision === 'CORRECTION' && result.labRequestItemId) {
      await this.prisma.labRequestItem.update({
        where: { id: result.labRequestItemId },
        data: { status: 'IN_ANALYSIS' },
      });
    }

    return updated;
  }

  async addResult(id: string, dto: any, reportedById?: string) {
    const actor = await this.requireClinic(reportedById);
    const request = await this.findOne(id, actor.id);
    if (request.externalReference) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: request.externalReference, clinicId: actor.clinicId } });
      if (invoice && invoice.status !== 'PAID') {
        throw new BadRequestException('Le resultat ne peut pas etre saisi avant validation du paiement par la caisse.');
      }
    }

    const technicianDirectRelease = await this.technicianDirectReleaseEnabled(actor.clinicId);
    const recipientId = request.requestedById || request.consultation?.providerId;
    const itemForResult = dto.labRequestItemId
      ? await this.prisma.labRequestItem.findFirst({ where: { id: dto.labRequestItemId, labRequestId: request.id }, include: { assignedTo: true } })
      : null;
    const reporter = reportedById
      ? await this.prisma.user.findFirst({ where: { id: reportedById, clinicId: actor.clinicId, status: 'ACTIVE', deletedAt: null }, select: { primaryRole: true } })
      : null;
    const isManager = reporter?.primaryRole === 'LAB_MANAGER';
    const canDirectSend = technicianDirectRelease || isManager;
    if (itemForResult?.assignedToId && itemForResult.assignedToId !== reportedById && !isManager) {
      throw new BadRequestException('Cette analyse a ete attribuee a un autre technicien. Vous pouvez la consulter mais pas enregistrer de resultat.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labResult.create({
        data: {
          labRequestId: id,
          labRequestItemId: dto.labRequestItemId || undefined,
          resultCode: dto.resultCode || dto.resultName || 'RESULT',
          resultName: dto.resultName,
          resultType: dto.resultType || 'MULTI_PARAMETER',
          resultStatus: canDirectSend ? 'BIOLOGICALLY_VALIDATED' : 'PENDING',
          resultValue: dto.resultValue,
          numericValue: dto.numericValue || undefined,
          textValue: dto.textValue || undefined,
          units: dto.units || null,
          referenceRange: dto.referenceRange || null,
          interpretation: dto.interpretation || null,
          reportedById,
          technicalValidatedById: reportedById,
          technicalValidationAt: new Date(),
          biologicalValidatedById: canDirectSend ? reportedById : undefined,
          biologicalValidationAt: canDirectSend ? new Date() : undefined,
          comments: dto.comments || null,
        },
      });

      const parameters = Array.isArray(dto.parameters) ? dto.parameters : [];
      const criticalNotifications: any[] = [];
      for (const parameter of parameters) {
        if (!parameter.labTestParameterId && parameter.valueNumeric === undefined && !parameter.valueText) continue;
        const template = parameter.labTestParameterId
          ? await tx.labTestParameter.findFirst({ where: { id: parameter.labTestParameterId, clinicId: actor.clinicId, active: true, archivedAt: null } })
          : null;
        if (parameter.labTestParameterId && !template) {
          throw new BadRequestException('Paramètre laboratoire introuvable dans cet établissement.');
        }
        const recordedParameter = await tx.labResultParameter.create({
          data: {
            labResultId: created.id,
            labTestParameterId: parameter.labTestParameterId || undefined,
            parameterCode: template?.code || parameter.parameterCode || undefined,
            parameterName: template?.name || parameter.parameterName || undefined,
            valueNumeric: parameter.valueNumeric === undefined || parameter.valueNumeric === '' ? undefined : parameter.valueNumeric,
            valueText: parameter.valueText?.trim() || undefined,
            unit: template?.unit || parameter.unit || undefined,
            referenceRange: template?.referenceRange || parameter.referenceRange || undefined,
            method: template?.method || parameter.method || undefined,
            interpretation: parameter.interpretation || undefined,
            reportedById: reportedById || undefined,
            reportedAt: new Date(),
          },
        });

        const numericValue = recordedParameter.valueNumeric === null ? undefined : Number(recordedParameter.valueNumeric);
        const isCritical = Number.isFinite(numericValue)
          && ((template?.criticalLow !== null && template?.criticalLow !== undefined && numericValue <= Number(template.criticalLow))
            || (template?.criticalHigh !== null && template?.criticalHigh !== undefined && numericValue >= Number(template.criticalHigh)));
        if (isCritical) {
          const direction = template?.criticalLow !== null && template?.criticalLow !== undefined && numericValue <= Number(template.criticalLow) ? 'bas' : 'élevé';
          const alert = await tx.labCriticalAlert.create({
            data: {
              patientId: request.patientId,
              labResultId: created.id,
              labResultParameterId: recordedParameter.id,
              severity: 'CRITICAL',
              message: `Valeur critique ${direction} : ${recordedParameter.parameterName || 'paramètre'} = ${numericValue} ${recordedParameter.unit || ''}`.trim(),
            },
          });
          const alertRecipients = Array.from(new Set([
            recipientId,
            ...(await tx.user.findMany({
              where: {
                clinicId: actor.clinicId,
                primaryRole: 'LAB_MANAGER',
                status: 'ACTIVE',
                deletedAt: null,
              },
              select: { id: true },
            })).map((user) => user.id),
          ].filter(Boolean)));
          for (const userId of alertRecipients) {
            criticalNotifications.push(await tx.notification.create({
              data: {
                recipientId: userId,
                patientId: request.patientId,
                type: 'ALERT', status: 'UNREAD', priority: 'CRITICAL',
                title: 'Valeur biologique critique',
                message: alert.message,
                relatedEntity: 'LabCriticalAlert', relatedId: alert.id, sendAt: new Date(),
              },
            }));
          }
        }
      }

      await tx.labRequest.update({
        where: { id },
        data: {
          status: canDirectSend ? 'AVAILABLE' : 'TECHNICAL_VALIDATION',
          completedAt: canDirectSend ? new Date() : undefined,
          performedAt: new Date(),
          sentAt: canDirectSend ? new Date() : null,
        },
      });

      if (canDirectSend) {
        await this.consumeConsumablesForValidatedResult(tx, created.id, created.labRequestItemId, reportedById);
      }

      let notification: any = null;
      if (canDirectSend && recipientId) {
        notification = await tx.notification.create({
          data: {
            recipientId,
            patientId: request.patientId,
            type: 'ALERT',
            status: 'UNREAD',
            priority: 'HIGH',
            title: 'Resultat laboratoire disponible',
            message: `Le resultat ${dto.resultName || request.specimenType || 'laboratoire'} de ${request.patient.firstName} ${request.patient.lastName} est disponible.`,
            relatedEntity: 'LabRequest',
            relatedId: request.id,
            sendAt: new Date(),
          },
        });
      }

      if (!canDirectSend) {
        const managers = await tx.user.findMany({
          where: {
            clinicId: actor.clinicId,
            primaryRole: 'LAB_MANAGER',
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: { id: true },
        });

        for (const manager of managers) {
          await tx.notification.create({
            data: {
              recipientId: manager.id,
              patientId: request.patientId,
              type: 'ALERT',
              status: 'UNREAD',
              priority: 'HIGH',
              title: 'Resultat laboratoire disponible',
              message: `Le resultat ${dto.resultName || request.specimenType || 'laboratoire'} de ${request.patient.firstName} ${request.patient.lastName} est disponible.`,
              relatedEntity: 'LabRequest',
              relatedId: request.id,
              sendAt: new Date(),
            },
          });
        }
      }

      const managerUsers = canDirectSend
        ? []
        : await tx.user.findMany({
            where: {
              clinicId: actor.clinicId,
              status: 'ACTIVE',
              deletedAt: null,
              OR: [
                { primaryRole: 'LAB_MANAGER' as any },
                { roles: { some: { role: { slug: 'LAB_MANAGER' as any } } } },
              ],
            },
          });

      const managerNotifications = await Promise.all(
        managerUsers.map((user) =>
          tx.notification.create({
            data: {
              recipientId: user.id,
              patientId: request.patientId,
              type: 'TASK',
              status: 'UNREAD',
              priority: request.priority === 'CRITICAL' ? 'CRITICAL' : request.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
              title: 'Resultat technique a valider',
              message: `Resultat ${dto.resultName || request.specimenType || 'laboratoire'} soumis pour ${request.patient.firstName} ${request.patient.lastName}.`,
              relatedEntity: 'LabResult',
              relatedId: created.id,
              sendAt: new Date(),
            },
          }),
        ),
      );

      return { created, notification, managerNotifications, criticalNotifications };
    });

    if (result.notification && recipientId) {
      this.notificationsGateway.notifyToUser(recipientId, 'notification.created', result.notification);
    }
    result.managerNotifications.forEach((notification) => {
      this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification);
    });
    result.criticalNotifications.forEach((notification) => {
      this.notificationsGateway.notifyToUser(notification.recipientId, 'notification.created', notification);
    });
    this.notificationsGateway.notify('lab.result.created', {
      labRequestId: id,
      patientId: request.patientId,
      result: result.created,
    });

    return result.created;
  }
}
