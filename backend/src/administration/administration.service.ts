import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  departments() {
    return (this.prisma as any).department.findMany({
      where: { deletedAt: null },
      include: {
        services: {
          where: { deletedAt: null },
          include: {
            rooms: { include: { beds: true } },
          },
        },
        Employee: true,
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
    return (this.prisma as any).department.create({
      data: {
        name: data.name,
        code: data.code,
        type: data.type,
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

  createMedication(data: any) {
    return (this.prisma as any).medication.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        unit: data.unit,
        strength: data.strength ?? null,
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
    const [patients, users, services, invoices, payments, hospitalizations, medications, departments, rooms, consultations, prescriptions, insurances, attendances, leaveRequests, payrolls, auditTrails] =
      await Promise.all([
        (this.prisma as any).patient.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).user.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).service.findMany({ include: { staff: true, responsables: true } }),
        (this.prisma as any).invoice.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).payment.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).hospitalization.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).medication.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).department.findMany({ where: { deletedAt: null } }),
        (this.prisma as any).room.findMany({ include: { beds: true } }),
        (this.prisma as any).consultation.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 }),
        (this.prisma as any).prescription.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 }),
        (this.prisma as any).insuranceClaim.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 }),
        (this.prisma as any).attendance.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
        (this.prisma as any).leaveRequest.findMany({ orderBy: { requestedAt: 'desc' }, take: 200 }),
        (this.prisma as any).payroll.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
        (this.prisma as any).auditTrail.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      ]);

    return {
      patients,
      users,
      services,
      invoices,
      payments,
      hospitalizations,
      medications,
      departments,
      rooms,
      consultations,
      prescriptions,
      insurances,
      attendances,
      leaveRequests,
      payrolls,
      auditTrails,
    };
  }

  async dashboard() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      patients,
      consultationsToday,
      hospitalizations,
      invoicesMonth,
      paymentsMonth,
      rooms,
      services,
      stocks,
      lots,
      recentConsultations,
    ] = await Promise.all([
      (this.prisma as any).patient.findMany({ where: { deletedAt: null } }),
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
      (this.prisma as any).invoice.findMany({
        where: {
          deletedAt: null,
          issuedAt: { gte: startOfMonth },
        },
        include: { patient: true },
        orderBy: { issuedAt: 'desc' },
      }),
      (this.prisma as any).payment.findMany({
        where: {
          deletedAt: null,
          paidAt: { gte: startOfMonth },
        },
        include: { invoice: { include: { patient: true } } },
        orderBy: { paidAt: 'desc' },
      }),
      (this.prisma as any).room.findMany({
        include: { beds: { include: { hospitalization: { include: { patient: true } } } }, serviceUnit: true },
      }),
      (this.prisma as any).service.findMany({
        include: {
          staff: { where: { actif: true }, include: { user: true } },
          responsables: { where: { actif: true }, include: { user: true } },
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

    const activePatients = patients.filter(
      (patient: any) => !['TERMINE', 'ANNULE'].includes(String(patient.workflowStatus || '')),
    );
    const beds = rooms.flatMap((room: any) => room.beds || []);
    const availableBeds = beds.filter((bed: any) => bed.status === 'FREE').length;
    const urgentPatients = patients.filter((patient: any) =>
      ['urgent', 'urgence', 'prioritaire', 'critical', 'critique'].includes(String(patient.priority || '').toLowerCase()),
    );
    const criticalStockItems = [
      ...stocks.filter((stock: any) => Number(stock.quantity || 0) <= Number(stock.criticalLevel || 0)),
      ...lots.filter((lot: any) => Number(lot.quantity || 0) <= 3),
    ];

    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        activePatients: activePatients.length,
        consultationsToday: consultationsToday.length,
        hospitalizations: hospitalizations.length,
        invoicesMonth: invoicesMonth.length,
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
        invoices: invoicesMonth.slice(0, 10),
        payments: paymentsMonth.slice(0, 10),
      },
    };
  }
}
