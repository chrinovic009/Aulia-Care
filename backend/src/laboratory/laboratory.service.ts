import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

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
  labTest?: { turnaroundTimeMinutes?: number | null; name?: string | null; price?: number | null; unit?: string | null; referenceRange?: string | null } | null;
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
  ) {}

  private async technicianDirectReleaseEnabled() {
    const config = await this.prisma.labConfiguration.findUnique({
      where: { key: 'technicianDirectRelease' },
    });
    const value = config?.value as { enabled?: boolean } | undefined;
    return Boolean(value?.enabled);
  }

  async getSettings() {
    return {
      technicianDirectRelease: await this.technicianDirectReleaseEnabled(),
    };
  }

  async updateSettings(dto: { technicianDirectRelease?: boolean }) {
    const enabled = Boolean(dto?.technicianDirectRelease);
    await this.prisma.labConfiguration.upsert({
      where: { key: 'technicianDirectRelease' },
      update: {
        value: { enabled },
        description: 'Autorise les techniciens laboratoire a envoyer un resultat valide directement au demandeur.',
      },
      create: {
        key: 'technicianDirectRelease',
        value: { enabled },
        description: 'Autorise les techniciens laboratoire a envoyer un resultat valide directement au demandeur.',
      },
    });
    return this.getSettings();
  }

  findAll() {
    return this.prisma.labRequest.findMany({
      where: {
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
                consumableRequirements: { include: { labConsumable: { include: { stock: true } } } },
              },
            },
            assignedTo: true,
            results: { include: { parameters: { include: { labTestParameter: true } }, reportedBy: true } },
          },
        },
        results: { include: { reportedBy: true }, orderBy: { reportedAt: 'desc' } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.labRequest.findUnique({
      where: { id },
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
                consumableRequirements: { include: { labConsumable: { include: { stock: true } } } },
              },
            },
            assignedTo: true,
            results: { include: { parameters: { include: { labTestParameter: true } }, reportedBy: true } },
          },
        },
        results: { include: { reportedBy: true }, orderBy: { reportedAt: 'desc' } },
      },
    });
    if (!request) {
      throw new NotFoundException('Demande de laboratoire introuvable');
    }

    const visibilityWhere = await this.buildLabRequestVisibilityWhere();
    const isVisible = await this.prisma.labRequest.findFirst({
      where: { id, ...visibilityWhere },
      select: { id: true },
    });

    if (!isVisible) {
      throw new NotFoundException('Demande de laboratoire introuvable');
    }

    return request;
  }

  async findCatalogue() {
    const [sections, categories, tests, sampleTypes, consumables] = await Promise.all([
      this.prisma.labSection.findMany({
        where: { active: true },
        include: {
          categories: { where: { active: true }, select: { id: true } },
          tests: { where: { active: true }, select: { id: true } },
        },
        orderBy: { order: 'asc' },
      }),
      this.prisma.labCategory.findMany({
        where: { active: true },
        include: {
          section: true,
          tests: { where: { active: true }, select: { id: true } },
        },
        orderBy: { order: 'asc' },
      }),
      this.prisma.labTest.findMany({
        where: { active: true },
        include: {
          category: true,
          section: true,
          parameterTemplates: true,
          sampleRequirements: { include: { labSampleType: true } },
          consumableRequirements: { include: { labConsumable: { include: { stock: true } } } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.labSampleType.findMany({
        where: { active: true },
        include: {
          sampleRequirements: { include: { labTest: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.labConsumable.findMany({
        where: { active: true },
        include: {
          stock: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      sections,
      categories,
      tests,
      sampleTypes,
      consumables,
    };
  }

  private async buildLabRequestVisibilityWhere() {
    const paidInvoices = await this.prisma.invoice.findMany({
      where: { type: 'LABORATORY', status: 'PAID' },
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
      return { deletedAt: null, id: { in: [] } };
    }

    return {
      deletedAt: null,
      OR: paidInvoiceConditions,
    };
  }

  private async buildLabReferenceCode(patient: { firstName?: string | null; lastName?: string | null; createdAt?: Date | string } | null | undefined, requestStatus: string, resultStatus?: string | null) {
    const patientNumber = patient?.createdAt
      ? await this.prisma.patient.count({ where: { createdAt: { lt: patient.createdAt as any } } }) + 1
      : 1;

    const firstNameInitial = String(patient?.firstName || '').trim().charAt(0).toUpperCase() || 'X';
    const lastNameInitial = String(patient?.lastName || '').trim().charAt(0).toUpperCase() || 'X';

    let suffix = 'LABD';
    if (['TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION', 'AVAILABLE', 'SENT', 'COMPLETED', 'VERIFIED'].includes(requestStatus)) {
      suffix = 'LABV';
    } else if (['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS'].includes(requestStatus)) {
      suffix = 'LABD';
    }

    if (resultStatus && ['PENDING', 'CORRECTION_REQUESTED'].includes(resultStatus)) {
      suffix = 'LABA';
    } else if (resultStatus && ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(resultStatus)) {
      suffix = 'LABV';
    }

    return `${patientNumber}D7-${firstNameInitial}${lastNameInitial}${suffix}`;
  }

  async getActivityOverview() {
    const visibilityWhere = await this.buildLabRequestVisibilityWhere();
    const [recentRequests, lowStockEntries, assignedItems, directResultAuthorizationEnabled] = await Promise.all([
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
      this.getDirectResultAuthorizationSetting(),
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
        this.prisma.labResult.count({ where: { deletedAt: null, resultStatus: 'PENDING' } }),
        this.prisma.labResult.count({ where: { deletedAt: null, resultStatus: 'TECHNICAL_VALIDATED' } }),
        this.prisma.labResult.count({ where: { deletedAt: null, resultStatus: 'BIOLOGICALLY_VALIDATED' } }),
        this.prisma.labSample.count({
          where: {
            deletedAt: null,
            status: { in: ['COLLECTED', 'IN_TRANSIT', 'RECEIVED', 'STORED'] },
          },
        }),
        this.prisma.labSample.count({ where: { deletedAt: null, status: 'RECEIVED' } }),
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
      const displayId = await this.buildLabReferenceCode(request.patient, request.status, request.results?.[0]?.resultStatus);
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
      assignedTo?: string | null;
      specimenType: string;
    }>;
    for (const request of recentRequests) {
      const assignedItem = request.items?.find((item) => item.assignedTo);
      const assignedTo = assignedItem
        ? assignedItem.assignedTo.displayName ||
          [assignedItem.assignedTo.firstName, assignedItem.assignedTo.lastName].filter(Boolean).join(' ')
        : null;
      const displayId = await this.buildLabReferenceCode(request.patient, request.status, request.results?.[0]?.resultStatus);
      recentRequestSummaries.push({
        id: request.id,
        displayId,
        patientName: [request.patient?.firstName, request.patient?.lastName].filter(Boolean).join(' ') || 'Patient inconnu',
        status: request.status,
        priority: request.priority || 'NORMAL',
        requestedAt: request.requestedAt.toISOString(),
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
      directResultAuthorizationEnabled,
    };
  }

  async getDashboardOverview() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const now = new Date();

    const visibilityWhere = await this.buildLabRequestVisibilityWhere();
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
      const turnaroundMinutes = Number(it.labTest?.turnaroundTimeMinutes || 0);
      if (!turnaroundMinutes || !it.requestedAt) {
        return false;
      }
      const requestedAtTime = new Date(it.requestedAt as any).getTime();
      const deadline = new Date(requestedAtTime + turnaroundMinutes * 60000);
      const normalizedStatus = String(it.status || '').toUpperCase();
      const hasValidatedResult = (it.results || []).some((result: LabResultLite) => ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(String(result.resultStatus || '').toUpperCase()));
      return now > deadline && !['COMPLETED', 'AVAILABLE', 'SENT', 'VERIFIED'].includes(normalizedStatus) && !hasValidatedResult;
    });

    const revenueToday = todayItems.reduce((sum, item) => sum + Number(item.labTest?.price || 0), 0);
    const totalRevenue = requests.flatMap((request) => request.items || []).reduce((sum, item) => sum + Number(item.labTest?.price || 0), 0);

    const workflow = requests.reduce((acc, request) => {
      const key = this.translateWorkflowStatus(request.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const validations = await this.getValidations(undefined, 'LAB_MANAGER');
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
      where: { deletedAt: null, assignedToId: { not: null } },
      include: { assignedTo: true, results: true },
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
      include: { labConsumable: true },
      orderBy: { lastUpdatedAt: 'desc' },
    });

    const quality = {
      validationsCount: requests.flatMap((request) => request.items || []).reduce((sum, item) => sum + ((item.results || []).some((result: any) => ['TECHNICAL_VALIDATED', 'BIOLOGICALLY_VALIDATED'].includes(String(result.resultStatus || '').toUpperCase())) ? 1 : 0), 0),
      sentCount: requests.filter((request) => request.sentAt && request.sentAt >= today && request.sentAt < tomorrow).length,
    };

    const recentActivity = await this.prisma.labRequestEvent.findMany({
      where: { createdAt: { gte: today, lt: tomorrow } },
      include: { labRequest: { include: { patient: true } }, labRequestItem: { include: { labTest: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const alerts = [
      ...((await this.getActivityOverview()).criticalAlerts || []),
      ...((await this.getActivityOverview()).lowStockAlerts || []).map((alert) => ({
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

  async getDashboardWorkflow() {
    const visibilityWhere = await this.buildLabRequestVisibilityWhere();
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

  async getDashboardAlerts() {
    const activity = await this.getActivityOverview();
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

  async repairMissingLabRequestItems() {
    const requestsWithoutItems = await this.prisma.labRequest.findMany({
      where: {
        deletedAt: null,
        items: { none: {} },
      },
      include: {
        items: true,
        patient: true,
        consultation: true,
      },
    });

    for (const request of requestsWithoutItems) {
      const trimmedSpecimen = request.specimenType?.trim();
      if (!trimmedSpecimen) {
        continue;
      }

      let labTest = await this.prisma.labTest.findFirst({
        where: {
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
          where: {
            active: true,
            name: { contains: trimmedSpecimen, mode: 'insensitive' },
          },
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
    const labDepartment = await this.prisma.department.findFirst({
      where: {
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

    await this.repairMissingLabRequestItems();

    const visibilityWhere = await this.buildLabRequestVisibilityWhere();
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
        where: { deletedAt: null, assignedToId: { not: null } },
        include: {
          assignedTo: true,
          labRequest: { include: { patient: true } },
          labTest: true,
          results: true,
          events: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      }),
      this.prisma.labRequestEvent.findMany({
        where: { labRequestItemId: { not: null } },
        include: {
          performedBy: true,
          labRequest: { include: { patient: true } },
          labRequestItem: { include: { labTest: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

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
            const turnaroundMinutes = item.labTest?.turnaroundTimeMinutes ? Number(item.labTest.turnaroundTimeMinutes) : null;

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

    const unassignedItems = (await this.prisma.labRequestItem.findMany({
      where: { deletedAt: null, assignedToId: null },
      include: {
        labRequest: { include: { patient: true } },
        labTest: true,
        results: true,
        events: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { requestedAt: 'desc' },
    })).filter((item: any) => visibleRequestIds.has(item.labRequestId));

    return {
      technicians: technicians.sort((a, b) => b.workload.pending - a.workload.pending),
      unassignedItems: unassignedItems.map((item: any) => ({
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
    const item = await this.prisma.labRequestItem.findUnique({
      where: { id: itemId },
      include: { labRequest: true },
    });

    if (!item) {
      throw new NotFoundException('Analyse introuvable');
    }

    const updated = await this.prisma.labRequestItem.update({
      where: { id: itemId },
      data: {
        assignedToId: dto.technicianId,
        status: item.status === 'REQUESTED' ? 'RECEIVED' : item.status,
        updatedAt: new Date(),
      },
    });

    await this.prisma.labRequestEvent.create({
      data: {
        labRequestId: item.labRequestId,
        labRequestItemId: item.id,
        action: 'TECHNICIAN_ASSIGNED',
        fromStatus: item.status,
        toStatus: updated.status,
        performedById: currentUser?.userId || currentUser?.id,
        note: dto.note || 'Analyse attribuée au technicien',
        createdAt: new Date(),
      },
    });

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: dto.technicianId,
        type: 'TASK',
        status: 'UNREAD',
        priority: item.labRequest?.priority === 'CRITICAL' ? 'CRITICAL' : item.labRequest?.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
        title: 'Analyse laboratoire attribuee',
        message: `Une analyse vous a ete attribuee. Les autres techniciens la verront en lecture seule.`,
        relatedEntity: 'LabRequestItem',
        relatedId: item.id,
        sendAt: new Date(),
      },
    });
    this.notificationsGateway.notifyToUser(dto.technicianId, 'notification.created', notification);
    this.notificationsGateway.notify('lab.item.assigned', {
      itemId: item.id,
      labRequestId: item.labRequestId,
      technicianId: dto.technicianId,
      assignedById: currentUser?.userId || currentUser?.id,
    });

    return updated;
  }

  async reassignTechnician(itemId: string, dto: { technicianId: string; reason?: string }, currentUser?: any) {
    const item = await this.prisma.labRequestItem.findUnique({
      where: { id: itemId },
      include: { labRequest: true, assignedTo: true },
    });

    if (!item) {
      throw new NotFoundException('Analyse introuvable');
    }

    const updated = await this.prisma.labRequestItem.update({
      where: { id: itemId },
      data: {
        assignedToId: dto.technicianId,
        updatedAt: new Date(),
      },
    });

    await this.prisma.labRequestEvent.create({
      data: {
        labRequestId: item.labRequestId,
        labRequestItemId: item.id,
        action: 'TECHNICIAN_REASSIGNED',
        fromStatus: item.status,
        toStatus: updated.status,
        performedById: currentUser?.userId || currentUser?.id,
        note: dto.reason || 'Analyse réaffectée',
        createdAt: new Date(),
      },
    });

    this.notificationsGateway.notify('lab.item.assigned', {
      itemId: item.id,
      labRequestId: item.labRequestId,
      previousTechnicianId: item.assignedToId,
      technicianId: dto.technicianId,
      assignedById: currentUser?.userId || currentUser?.id,
    });

    return {
      item: updated,
      previousTechnicianId: item.assignedToId,
      newTechnicianId: dto.technicianId,
    };
  }

  async createSection(dto: { name: string; description?: string; order?: string; active?: boolean }) {
    return this.prisma.labSection.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        order: dto.order ? Number(dto.order) || 0 : 0,
        active: dto.active ?? true,
      },
    });
  }

  async createCategory(dto: { sectionId?: string; name: string; code?: string; description?: string; order?: string; active?: boolean }) {
    return this.prisma.labCategory.create({
      data: {
        sectionId: dto.sectionId || undefined,
        name: dto.name.trim(),
        code: dto.code?.trim() || undefined,
        description: dto.description?.trim() || undefined,
        order: dto.order ? Number(dto.order) || 0 : 0,
        active: dto.active ?? true,
      },
    });
  }

  async createTest(dto: {
    code: string;
    name: string;
    categoryId: string;
    sectionId?: string;
    description?: string;
    price: string;
    turnaroundTimeMinutes?: string;
    resultType: string;
    unit?: string;
    referenceRange?: string;
    genderRestriction?: string;
    minAge?: string;
    maxAge?: string;
  }, createdById?: string) {
    const testName = dto.name.trim();
    const price = Number(dto.price || 0);
    if (price <= 0) {
      throw new BadRequestException('Le prix CDF de l examen est obligatoire.');
    }

    return this.prisma.$transaction(async (tx) => {
      const labDepartment = await tx.department.upsert({
        where: { name: 'LABORATOIRE' },
        update: {},
        create: {
          name: 'LABORATOIRE',
          code: 'laboratoire',
          type: 'LABORATORY',
          description: 'Analyses biomedicales, prelevements, resultats et validations.',
        },
      });

      const service = await tx.service.upsert({
        where: { name: testName },
        update: {
          description: dto.description?.trim() || undefined,
          active: true,
          isParamedical: true,
        },
        create: {
          name: testName,
          description: dto.description?.trim() || 'Examen laboratoire',
          active: true,
          isParamedical: true,
        },
      });

      await (tx as any).serviceUnit.upsert({
        where: {
          departmentId_name: {
            departmentId: labDepartment.id,
            name: testName,
          },
        },
        update: { active: true },
        create: {
          departmentId: labDepartment.id,
          name: testName,
          active: true,
        },
      });

      await tx.serviceTarif.updateMany({
        where: { serviceId: service.id, actif: true },
        data: { actif: false, dateFin: new Date() },
      });

      await tx.serviceTarif.create({
        data: {
          serviceId: service.id,
          prix: price,
          actif: true,
        },
      });

      return tx.labTest.create({
        data: {
          code: dto.code.trim(),
          name: testName,
          categoryId: dto.categoryId,
          sectionId: dto.sectionId || undefined,
          description: dto.description?.trim() || undefined,
          price,
          turnaroundTimeMinutes: dto.turnaroundTimeMinutes ? Number(dto.turnaroundTimeMinutes) : undefined,
          resultType: dto.resultType as any,
          unit: dto.unit?.trim() || undefined,
          referenceRange: dto.referenceRange?.trim() || undefined,
          genderRestriction: dto.genderRestriction ? (dto.genderRestriction as any) : 'ALL',
          minAge: dto.minAge ? Number(dto.minAge) : undefined,
          maxAge: dto.maxAge ? Number(dto.maxAge) : undefined,
          createdById: createdById || undefined,
        },
      });
    });
  }

  async createTestParameter(dto: {
    labTestId: string;
    code: string;
    name: string;
    unit?: string;
    resultType?: string;
    referenceRange?: string;
    minValue?: string;
    maxValue?: string;
    order?: string;
    active?: boolean;
  }) {
    return this.prisma.labTestParameter.create({
      data: {
        labTestId: dto.labTestId,
        code: dto.code.trim(),
        name: dto.name.trim(),
        unit: dto.unit?.trim() || undefined,
        resultType: dto.resultType ? (dto.resultType as any) : 'NUMERIC',
        referenceRange: dto.referenceRange?.trim() || undefined,
        minValue: dto.minValue || undefined,
        maxValue: dto.maxValue || undefined,
        order: dto.order ? Number(dto.order) || 0 : 0,
        active: dto.active ?? true,
      },
    });
  }

  async createSampleType(dto: { name: string; description?: string; active?: boolean }) {
    return this.prisma.labSampleType.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        active: dto.active ?? true,
      },
    });
  }

  async createSampleRequirement(dto: {
    labTestId: string;
    labSampleTypeId: string;
    volumeRequired?: string;
    volumeUnit?: string;
    storageCondition?: string;
    maxAgeMinutes?: string;
    instructions?: string;
  }) {
    return this.prisma.labTestSampleRequirement.create({
      data: {
        labTestId: dto.labTestId,
        labSampleTypeId: dto.labSampleTypeId,
        volumeRequired: dto.volumeRequired || undefined,
        volumeUnit: dto.volumeUnit?.trim() || undefined,
        storageCondition: dto.storageCondition?.trim() || undefined,
        maxAgeMinutes: dto.maxAgeMinutes ? Number(dto.maxAgeMinutes) : undefined,
        instructions: dto.instructions?.trim() || undefined,
      },
    });
  }

  async createConsumable(dto: { name: string; code: string; description?: string; unit: string; active?: boolean }) {
    return this.prisma.labConsumable.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim(),
        description: dto.description?.trim() || undefined,
        unit: dto.unit.trim(),
        active: dto.active ?? true,
      },
    });
  }

  async createConsumableRequirement(dto: { labTestId: string; labConsumableId: string; quantity: string; unit?: string }) {
    return this.prisma.labTestConsumableRequirement.create({
      data: {
        labTestId: dto.labTestId,
        labConsumableId: dto.labConsumableId,
        quantity: dto.quantity,
        unit: dto.unit?.trim() || undefined,
      },
    });
  }

  async createConsumableStock(dto: {
    labConsumableId: string;
    quantity: string;
    minimumLevel?: string;
    criticalLevel?: string;
    location?: string;
  }, updatedById?: string) {
    return this.prisma.labConsumableStock.create({
      data: {
        labConsumableId: dto.labConsumableId,
        quantity: dto.quantity,
        minimumLevel: dto.minimumLevel || undefined,
        criticalLevel: dto.criticalLevel || undefined,
        location: dto.location?.trim() || undefined,
        lastUpdatedAt: new Date(),
        updatedById: updatedById || undefined,
      },
    });
  }

  async getValidations(currentUserId?: string, currentRole?: string) {
    const where: any = {};
    const normalizedRole = String(currentRole || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (normalizedRole.includes('TECHNICIAN')) {
      where.items = { some: { assignedToId: currentUserId } };
    }

    const visibilityWhere = await this.buildLabRequestVisibilityWhere();
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

  private async getDirectResultAuthorizationSetting() {
    const config = await this.prisma.labConfiguration.findUnique({
      where: { key: 'lab.direct_result_authorization' },
    });

    return Boolean((config?.value as any)?.enabled);
  }

  private async canSendResultDirectly(userId?: string) {
    if (!userId) {
      return { allowed: false, isManager: false };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        primaryRole: true,
        Employee: {
          select: {
            id: true,
            shifts: {
              select: {
                id: true,
                startAt: true,
                endAt: true,
                type: true,
              },
            },
          },
        },
      },
    });

    const role = String(user?.primaryRole || '').toUpperCase();
    if (['LAB_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return { allowed: true, isManager: true };
    }

    const configEnabled = await this.getDirectResultAuthorizationSetting();
    if (!configEnabled) {
      return { allowed: false, isManager: false };
    }

    const now = new Date();
    const hasActiveShift = (user?.Employee || []).some((employee: any) =>
      (employee.shifts || []).some((shift: any) => {
        const startAt = new Date(shift.startAt);
        const endAt = new Date(shift.endAt);
        return startAt <= now && endAt >= now;
      }),
    );

    return { allowed: hasActiveShift, isManager: false };
  }

  async setDirectResultAuthorization(enabled: boolean, currentUserId?: string) {
    const entry = await this.prisma.labConfiguration.upsert({
      where: { key: 'lab.direct_result_authorization' },
      update: {
        value: { enabled, updatedById: currentUserId },
      },
      create: {
        key: 'lab.direct_result_authorization',
        value: { enabled, updatedById: currentUserId },
        description: 'Autorise les techniciens de laboratoire actifs sur leur shift à envoyer directement les résultats au patient ou au médecin.',
      },
    });

    return {
      enabled,
      updatedAt: entry.updatedAt,
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
    if (!labRequestItemId) {
      return;
    }

    const item = await tx.labRequestItem.findUnique({
      where: { id: labRequestItemId },
      select: { labTestId: true },
    });

    if (!item?.labTestId) {
      return;
    }

    const requirements = await tx.labTestConsumableRequirement.findMany({
      where: { labTestId: item.labTestId },
      include: { labConsumable: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const requirement of requirements) {
      const requiredQuantity = Number(requirement.quantity || 0);
      if (requiredQuantity <= 0) {
        continue;
      }

      const stockEntries = await tx.labConsumableStock.findMany({
        where: { labConsumableId: requirement.labConsumableId },
        orderBy: [{ lastUpdatedAt: 'asc' }, { id: 'asc' }],
      });

      let remainingToConsume = requiredQuantity;
      for (const stockEntry of stockEntries) {
        if (remainingToConsume <= 0) {
          break;
        }

        const availableQuantity = Number(stockEntry.quantity || 0);
        if (availableQuantity <= 0) {
          continue;
        }

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
            labConsumableId: requirement.labConsumableId,
            type: 'OUT',
            quantity: consumedQuantity,
            unit: requirement.unit || requirement.labConsumable?.unit || 'unité',
            reference: `lab-result:${resultId}`,
            note: `Consommation liée à la validation du résultat de laboratoire`,
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

  async applyValidationDecision(id: string, dto: any, currentUserId?: string) {
    const result = await this.prisma.labResult.findUnique({
      where: { id },
      include: {
        labRequest: { include: { patient: true, consultation: true } },
        labRequestItem: true,
      },
    });
    if (!result) {
      throw new NotFoundException('Résultat introuvable');
    }

    const labRequest = await this.prisma.labRequest.findUnique({
      where: { id: result.labRequestId },
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
          biologicalValidatedById: currentUserId,
          comments: dto.observations || dto.reason || dto.instructions || null,
          interpretation: dto.observations || dto.reason || dto.instructions || null,
        },
      });

      if (decision === 'VALIDATE') {
        await this.consumeConsumablesForValidatedResult(tx, updatedResult.id, updatedResult.labRequestItemId, currentUserId);

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
    const request = await this.findOne(id);
    if (request.externalReference) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: request.externalReference } });
      if (invoice && invoice.status !== 'PAID') {
        throw new BadRequestException('Le resultat ne peut pas etre saisi avant validation du paiement par la caisse.');
      }
    }

    const directRelease = await this.technicianDirectReleaseEnabled();
    const recipientId = request.requestedById || request.consultation?.providerId;
    const itemForResult = dto.labRequestItemId
      ? await this.prisma.labRequestItem.findUnique({ where: { id: dto.labRequestItemId }, include: { assignedTo: true } })
      : null;
    const reporter = reportedById
      ? await this.prisma.user.findUnique({ where: { id: reportedById }, select: { primaryRole: true } })
      : null;
    const isManager = reporter?.primaryRole === 'LAB_MANAGER';
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
          resultStatus: directRelease ? 'BIOLOGICALLY_VALIDATED' : 'PENDING',
          resultValue: dto.resultValue,
          numericValue: dto.numericValue || undefined,
          textValue: dto.textValue || undefined,
          units: dto.units || null,
          referenceRange: dto.referenceRange || null,
          interpretation: dto.interpretation || null,
          reportedById,
          technicalValidatedById: reportedById,
          technicalValidationAt: new Date(),
          biologicalValidatedById: directRelease ? reportedById : undefined,
          biologicalValidationAt: directRelease ? new Date() : undefined,
          comments: dto.comments || null,
        },
      });

      const parameters = Array.isArray(dto.parameters) ? dto.parameters : [];
      for (const parameter of parameters) {
        if (!parameter.labTestParameterId && !parameter.valueNumeric && !parameter.valueText) continue;
        await tx.labResultParameter.create({
          data: {
            labResultId: created.id,
            labTestParameterId: parameter.labTestParameterId || undefined,
            valueNumeric: parameter.valueNumeric || undefined,
            valueText: parameter.valueText || undefined,
            interpretation: parameter.interpretation || undefined,
          },
        });
      }

      // Determine whether we can directly send the result/notification
      const canDirectSend = directRelease;

      await tx.labRequest.update({
        where: { id },
        data: {
          status: directRelease ? 'AVAILABLE' : 'TECHNICAL_VALIDATION',
          completedAt: directRelease ? new Date() : undefined,
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
            primaryRole: 'LAB_MANAGER',
            status: 'ACTIVE',
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

      const managerUsers = directRelease
        ? []
        : await tx.user.findMany({
            where: {
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

      return { created, notification, managerNotifications };
    });

    if (result.notification && recipientId) {
      this.notificationsGateway.notifyToUser(recipientId, 'notification.created', result.notification);
    }
    result.managerNotifications.forEach((notification) => {
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
