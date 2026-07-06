import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  async addDepartmentResponsables(
    items: {
      departmentId: string;
      userId: string;
      principal?: boolean;
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

  createDepartment(data: any) {
    // Sécurité : On s'assure que le type est fourni
    if (!data.type) {
      throw new BadRequestException("Le champ 'type' (DepartmentType) est requis pour créer un département.");
    }

    return (this.prisma as any).department.create({
      data: {
        name: data.name,
        code: data.code,
        type: data.type, // Reçu depuis ton DTO / Contrôleur
        description: data.description ?? null,
      },
    });
  }

  createServiceUnit(data: any) {
    return (this.prisma as any).serviceUnit.create({
      data: {
        name: data.name,
        departmentId: data.departmentId,
        location: data.location ?? null,
        contactNumber: data.contactNumber ?? null,
        active: data.active ?? true,
      },
    });
  }

  rooms() {
    return Promise.all([
      (this.prisma as any).room.findMany({
        include: {
          serviceUnit: { include: { department: true } },
          beds: { include: { hospitalization: { include: { patient: true } } } },
        },
        orderBy: { number: 'asc' },
      }),
      (this.prisma as any).operatingRoom.findMany({
        where: { deletedAt: null },
        include: { surgeries: { orderBy: { scheduledAt: 'desc' }, take: 10 } },
        orderBy: { name: 'asc' },
      }),
    ]).then(([rooms, operatingRooms]) => ({ rooms, operatingRooms }));
  }

  createRoom(data: any) {
    return (this.prisma as any).room.create({
      data: {
        number: data.number,
        serviceUnitId: data.serviceUnitId,
        status: data.status ?? 'AVAILABLE',
      },
      include: { beds: true, serviceUnit: true },
    });
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
}