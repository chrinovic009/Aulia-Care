import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class LaboratoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  findAll() {
    return this.prisma.labRequest.findMany({
      where: { deletedAt: null },
      include: {
        patient: true,
        requestedBy: true,
        consultation: { include: { provider: true } },
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
                section: true,
                category: true,
                parameterTemplates: true,
                sampleRequirements: { include: { labSampleType: true } },
                consumableRequirements: { include: { labConsumable: { include: { stock: true } } } },
              },
            },
            assignedTo: true,
            samples: { include: { labSampleType: true } },
            results: { include: { reportedBy: true }, orderBy: { reportedAt: 'desc' } },
          },
        },
        results: { include: { reportedBy: true }, orderBy: { reportedAt: 'desc' } },
      },
    });
    if (!request) {
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

  private async buildLabReferenceCode(patient: any, requestStatus: string, resultStatus?: string | null) {
    const patientNumber = patient?.createdAt
      ? await this.prisma.patient.count({ where: { createdAt: { lt: patient.createdAt } } }) + 1
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
    const [recentRequests, lowStockEntries, assignedItems, directResultAuthorizationEnabled] = await Promise.all([
      this.prisma.labRequest.findMany({
        where: { deletedAt: null },
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
        where: { deletedAt: null, assignedToId: { not: null } },
        include: { assignedTo: true, labTest: true, labRequest: { include: { patient: true } } },
      }),
      this.getDirectResultAuthorizationSetting(),
    ]);

    const [totalRequests, pendingRequests, validationQueueCount, technicalValidationCount, biologicalValidationCount, sampleCollectedCount, sampleReceivedCount] =
      await Promise.all([
        this.prisma.labRequest.count({ where: { deletedAt: null } }),
        this.prisma.labRequest.count({
          where: {
            deletedAt: null,
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
      if (!item.assignedTo) {
        return;
      }
      const technicianName =
        item.assignedTo.displayName ||
        [item.assignedTo.firstName, item.assignedTo.lastName].filter(Boolean).join(' ') ||
        'Technicien';
      const existing = technicianMap.get(item.assignedTo.id) ?? {
        technician: technicianName,
        assignedItems: 0,
        openItems: 0,
      };
      existing.assignedItems += 1;
      if (['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS', 'TECHNICAL_VALIDATION', 'BIOLOGICAL_VALIDATION'].includes(item.status)) {
        existing.openItems += 1;
      }
      technicianMap.set(item.assignedTo.id, existing);
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

    const criticalAlerts = [] as Array<any>;
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

    const recentRequestSummaries = [] as Array<any>;
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

    const [requestsToday, examsToday, resultsPending, resultsValidatedToday, overdue, revenueToday] = await Promise.all([
      this.prisma.labRequest.count({ where: { deletedAt: null, requestedAt: { gte: today, lt: tomorrow } } }),
      this.prisma.labResult.count({ where: { deletedAt: null, reportedAt: { gte: today, lt: tomorrow } } }),
      this.prisma.labResult.count({ where: { deletedAt: null, resultStatus: { in: ['PENDING', 'TECHNICAL_VALIDATED', 'CORRECTION_REQUESTED'] as any } } }),
      this.prisma.labResult.count({ where: { deletedAt: null, biologicalValidationAt: { gte: today, lt: tomorrow } } }),
      this.prisma.labRequestItem.count({
        where: {
          deletedAt: null,
          status: { in: ['REQUESTED', 'COLLECTED', 'RECEIVED', 'IN_ANALYSIS'] as any },
          labTest: { turnaroundTimeMinutes: { not: null } },
        },
      }),
      this.prisma.labRequestItem.findMany({
        where: { deletedAt: null, requestedAt: { gte: today, lt: tomorrow } },
        include: { labTest: true },
      }),
    ]);

    return {
      requestsToday,
      examsToday,
      resultsPending,
      resultsValidatedToday,
      overdue,
      revenueToday: revenueToday.reduce((sum, item: any) => sum + Number(item.labTest?.price || 0), 0),
    };
  }

  async getDashboardWorkflow() {
    const groups = await this.prisma.labRequest.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    return groups.reduce((acc, item) => {
      acc[item.status] = item._count._all;
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
    const labServiceIds = (currentUser?.serviceResponsabilites || [])
      .filter((responsibility: any) => responsibility?.service?.name?.toLowerCase().includes('laboratoire'))
      .map((responsibility: any) => responsibility.service?.id)
      .filter(Boolean) as string[];

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(startOfDay);
    startOfMonth.setDate(1);

    await this.repairMissingLabRequestItems();

    const [staffRecords, assignedItems, requestEvents] = await Promise.all([
      this.prisma.serviceStaff.findMany({
        where: {
          actif: true,
          ...(labServiceIds.length ? { serviceId: { in: labServiceIds } } : {}),
        },
        include: {
          service: true,
          user: {
            include: {
              serviceResponsabilites: { include: { service: true } },
            },
          },
        },
      }),
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
        .filter((record: any) => record.user?.primaryRole === 'LAB_TECHNICIAN')
        .map(async (record: any) => {
          const user = record.user;
          const technicianItems = assignedItems.filter((item: any) => item.assignedToId === user.id);
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

    const unassignedItems = await this.prisma.labRequestItem.findMany({
      where: { deletedAt: null, assignedToId: null },
      include: {
        labRequest: { include: { patient: true } },
        labTest: true,
        results: true,
        events: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { requestedAt: 'desc' },
    });

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
    return this.prisma.labTest.create({
      data: {
        code: dto.code.trim(),
        name: dto.name.trim(),
        categoryId: dto.categoryId,
        sectionId: dto.sectionId || undefined,
        description: dto.description?.trim() || undefined,
        price: dto.price,
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

    const requests = await this.prisma.labRequest.findMany({
      where,
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
                parameters: true,
                technicalValidatedBy: true,
                biologicalValidatedBy: true,
              },
            },
          },
        },
        results: {
          include: {
            parameters: true,
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
          parameters: (resultData.parameters || []).map((parameter: any) => ({
            id: parameter.id,
            name: 'Paramètre',
            value: parameter.valueNumeric?.toString() || parameter.valueText || null,
            unit: null,
            referenceRange: null,
            interpretation: parameter.interpretation || null,
            outOfRange: false,
          })),
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

  async applyValidationDecision(id: string, dto: any, currentUserId?: string) {
    const result = await this.prisma.labResult.findUnique({ where: { id } });
    if (!result) {
      throw new NotFoundException('Résultat introuvable');
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

    return updated;
  }

  async addResult(id: string, dto: any, reportedById?: string) {
    const request = await this.findOne(id);
    const recipientId = request.requestedById || request.consultation?.providerId;
    const directSendPermission = await this.canSendResultDirectly(reportedById);
    const canDirectSend = directSendPermission.allowed;

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.labResult.create({
        data: {
          labRequestId: id,
          labRequestItemId: dto.labRequestItemId || null,
          resultCode: dto.resultCode || dto.resultName || 'RESULT',
          resultName: dto.resultName,
          resultValue: dto.resultValue,
          units: dto.units || null,
          referenceRange: dto.referenceRange || null,
          interpretation: dto.interpretation || null,
          reportedById,
          resultStatus: canDirectSend ? 'TECHNICAL_VALIDATED' : 'PENDING',
          technicalValidatedById: canDirectSend ? reportedById : null,
          technicalValidationAt: canDirectSend ? new Date() : null,
        },
      });

      await tx.labRequest.update({
        where: { id },
        data: {
          status: canDirectSend ? 'SENT' : 'TECHNICAL_VALIDATION',
          completedAt: canDirectSend ? new Date() : null,
          performedAt: new Date(),
          sentAt: canDirectSend ? new Date() : null,
        },
      });

      if (canDirectSend && recipientId) {
        const notification = await tx.notification.create({
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

        return { created, notification };
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
              title: 'Validation de résultat laboratoire requise',
              message: `Le résultat ${dto.resultName || request.specimenType || 'laboratoire'} de ${request.patient.firstName} ${request.patient.lastName} attend votre validation.`,
              relatedEntity: 'LabRequest',
              relatedId: request.id,
              sendAt: new Date(),
            },
          });
        }
      }

      return { created, notification: null };
    });

    if (result.notification && recipientId) {
      this.notificationsGateway.notifyToUser(recipientId, 'notification.created', result.notification);
    }
    this.notificationsGateway.notify('lab.result.created', {
      labRequestId: id,
      patientId: request.patientId,
      result: result.created,
    });

    return result.created;
  }
}
