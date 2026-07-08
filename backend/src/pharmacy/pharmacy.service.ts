import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PharmacyService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.medication.findMany();
  }

  async findAvailable() {
    const medications = await this.prisma.medication.findMany({
      where: { deletedAt: null },
      include: {
        StockLot: true,
        StockTransaction: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
      orderBy: { name: 'asc' },
    });

    return medications
      .map((medication) => {
        const quantity = medication.StockLot.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
        const latestLot = medication.StockLot
          .slice()
          .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
        return {
          ...medication,
          availableQuantity: quantity,
          unitPrice: latestLot?.purchasePrice || null,
          lots: medication.StockLot,
        };
      })
      .filter((medication) => medication.availableQuantity > 0);
  }

  async findPrescriptions() {
    const patients = await this.prisma.patient.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'asc' },
    });

    const patientIds = new Map<string, string>();
    patients.forEach((patient, index) => {
      const firstInitial = (patient.firstName || '').trim().charAt(0) || 'X';
      const lastInitial = (patient.lastName || '').trim().charAt(0) || 'X';
      const normalizedFirst = firstInitial.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      const normalizedLast = lastInitial.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      patientIds.set(patient.id, `${index + 1}${normalizedFirst}${normalizedLast}-ADMIN`);
    });

    const prescriptions = await this.prisma.prescription.findMany({
      where: { deletedAt: null },
      include: {
        patient: true,
        prescriber: true,
        consultation: true,
        lineItems: { include: { medication: true } },
        pharmacyDispenses: { include: { dispensedBy: true, lines: { include: { medication: true } } } },
      },
      orderBy: { prescribingDate: 'desc' },
    });

    return prescriptions.map((prescription) => ({
      ...prescription,
      patient: {
        ...prescription.patient,
        displayId: patientIds.get(prescription.patientId) || null,
      },
    }));
  }

  async findReadyPrescriptions() {
    const prescriptions = await this.findPrescriptions();
    return prescriptions.filter((prescription) => prescription.status !== 'DISPENSED');
  }

  async dispensePrescription(prescriptionId: string, actorId?: string) {
    if (!actorId) {
      throw new BadRequestException('Utilisateur non identifié.');
    }

    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        patient: true,
        lineItems: { include: { medication: true } },
        pharmacyDispenses: true,
      },
    });

    if (!prescription) {
      throw new NotFoundException('Ordonnance introuvable.');
    }

    if (prescription.status === 'DISPENSED' || prescription.pharmacyDispenses.length > 0) {
      throw new BadRequestException("Cette ordonnance a déjà été délivrée.");
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        deletedAt: null,
        type: 'PHARMACY',
        status: 'PAID',
        remarks: { contains: `Prescription:${prescriptionId}` },
      },
    });

    if (!invoice) {
      throw new BadRequestException('La prescription doit être payée avant délivrance.');
    }

    if (!prescription.lineItems?.length) {
      throw new BadRequestException('Ordonnance sans lignes de traitement.');
    }

    const medicationIds = prescription.lineItems.map((line) => line.medicationId);
    const lots = await this.prisma.stockLot.findMany({
      where: {
        medicationId: { in: medicationIds },
        quantity: { gt: 0 },
      },
      orderBy: [{ medicationId: 'asc' }, { receivedAt: 'asc' }, { expiryDate: 'asc' }],
    });

    const lotsByMedication = new Map<string, Array<any>>();
    for (const lot of lots) {
      const items = lotsByMedication.get(lot.medicationId) || [];
      items.push({ ...lot });
      lotsByMedication.set(lot.medicationId, items);
    }

    const dispenseLines: Array<any> = [];
    const stockUpdates: Array<{ id: string; quantity: number }> = [];
    const stockTransactions: Array<any> = [];

    for (const line of prescription.lineItems) {
      const requiredQuantity = Number(line.quantity || 0);
      let remaining = requiredQuantity;
      const medicationLots = lotsByMedication.get(line.medicationId) || [];
      const availableQuantity = medicationLots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
      if (availableQuantity < requiredQuantity) {
        throw new BadRequestException(`Stock insuffisant pour ${line.medication?.name || 'ce médicament'}.`);
      }

      let lineUnitPrice = 0;
      const defaultLotPrice = medicationLots.find((lot) => lot.purchasePrice !== null)?.purchasePrice;
      if (defaultLotPrice !== undefined && defaultLotPrice !== null) {
        lineUnitPrice = Number(defaultLotPrice);
      }
      for (const lot of medicationLots) {
        if (remaining <= 0) break;
        const used = Math.min(Number(lot.quantity || 0), remaining);
        if (used <= 0) continue;
        remaining -= used;
        lot.quantity = Number(lot.quantity) - used;
        stockUpdates.push({ id: lot.id, quantity: lot.quantity });
        stockTransactions.push({
          medicationId: line.medicationId,
          lotId: lot.id,
          type: 'DISPENSE',
          quantity: -used,
          unitPrice: lot.purchasePrice ?? 0,
          reference: `Prescription:${prescriptionId}`,
          performedById: actorId,
          clinicId: prescription.patient?.clinicId || null,
        });
        if (lineUnitPrice === 0) {
          lineUnitPrice = Number(lot.purchasePrice || 0);
        }
      }

      dispenseLines.push({
        medicationId: line.medicationId,
        quantity: requiredQuantity,
        unitPrice: lineUnitPrice,
        totalPrice: lineUnitPrice * requiredQuantity,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      for (const update of stockUpdates) {
        await tx.stockLot.update({
          where: { id: update.id },
          data: { quantity: update.quantity },
        });
      }

      for (const transaction of stockTransactions) {
        await tx.stockTransaction.create({ data: transaction });
      }

      const pharmacyDispense = await tx.pharmacyDispense.create({
        data: {
          prescriptionId,
          dispensedById: actorId,
          location: 'Pharmacie',
          status: 'DISPENSED',
          notes: `Délivrance effectuée pour la prescription ${prescriptionId}`,
          lines: {
            create: dispenseLines.map((line) => ({
              medicationId: line.medicationId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalPrice: line.totalPrice,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.prescription.update({
        where: { id: prescriptionId },
        data: { status: 'DISPENSED' },
      });

      await tx.patient.update({
        where: { id: prescription.patientId },
        data: { workflowStatus: PatientWorkflowStatus.TERMINE },
      });

      return pharmacyDispense;
    });
  }

  async createIndependentSale(data: any, actorId?: string) {
    if (!actorId) {
      throw new BadRequestException('Utilisateur non identifié.');
    }

    const medicationId = data?.medicationId;
    const quantity = Number(data?.quantity || 0);

    if (!medicationId || !quantity || quantity <= 0) {
      throw new BadRequestException('Médicament et quantité requis.');
    }

    const medication = await this.prisma.medication.findUnique({
      where: { id: medicationId },
      include: { StockLot: true },
    });

    if (!medication) {
      throw new NotFoundException('Médicament introuvable.');
    }

    const available = medication.StockLot.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
    if (available < quantity) {
      throw new BadRequestException(`Stock insuffisant pour ${medication.name}.`);
    }

    const lots = await this.prisma.stockLot.findMany({
      where: { medicationId, quantity: { gt: 0 } },
      orderBy: [{ receivedAt: 'asc' }, { expiryDate: 'asc' }],
    });

    const stockUpdates: Array<{ id: string; quantity: number }> = [];
    const stockTransactions: Array<any> = [];
    let remaining = quantity;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const used = Math.min(Number(lot.quantity || 0), remaining);
      if (used <= 0) continue;
      remaining -= used;
      const newQuantity = Number(lot.quantity || 0) - used;
      stockUpdates.push({ id: lot.id, quantity: newQuantity });
      stockTransactions.push({
        medicationId,
        lotId: lot.id,
        type: 'SALE',
        quantity: -used,
        unitPrice: Number(lot.purchasePrice || 0),
        reference: `IndependentSale:${data?.source || 'PHARMACY'}`,
        performedById: actorId,
        clinicId: data?.clinicId || null,
      });
    }

    if (remaining > 0) {
      throw new BadRequestException(`Stock insuffisant pour ${medication.name}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      for (const update of stockUpdates) {
        await tx.stockLot.update({ where: { id: update.id }, data: { quantity: update.quantity } });
      }

      for (const transaction of stockTransactions) {
        await tx.stockTransaction.create({ data: transaction });
      }

      return tx.stockTransaction.findMany({
        where: { reference: { contains: data?.source || 'PHARMACY' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
    });
  }

  async findOne(id: string) {
    const medication = await this.prisma.medication.findUnique({ where: { id } });
    if (!medication) {
      throw new NotFoundException('Médicament introuvable');
    }
    return medication;
  }
}
