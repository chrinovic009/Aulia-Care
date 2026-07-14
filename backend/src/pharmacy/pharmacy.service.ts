import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async findOne(id: string) {
    const medication = await this.prisma.medication.findUnique({ where: { id } });
    if (!medication) {
      throw new NotFoundException('Médicament introuvable');
    }
    return medication;
  }

  async stockCatalog() {
    const [medications, lots, transactions, dispenses] = await Promise.all([
      this.prisma.medication.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
      this.prisma.stockLot.findMany({ include: { medication: true }, orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'desc' }] }),
      this.prisma.stockTransaction.findMany({ include: { medication: true, lot: true, performedBy: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.pharmacyDispense.findMany({ include: { prescription: { include: { patient: true } }, lines: { include: { medication: true } } }, orderBy: { dispensedAt: 'desc' }, take: 50 }),
    ]);

    return { medications, lots, transactions, dispenses };
  }

  async createMedication(data: any) {
    const code = String(data.code || '').trim();
    const name = String(data.name || '').trim();
    const unit = String(data.unit || '').trim();
    const strength = String(data.strength || '').trim() || null;

    if (!code || !name || !unit) {
      throw new BadRequestException('Le code, le nom et l unite du medicament sont requis.');
    }

    let existing = await this.prisma.medication.findUnique({ where: { code }, include: { StockLot: true } });
    if (!existing) {
      existing = await this.prisma.medication.findFirst({
        where: { deletedAt: null, name, unit, strength },
        include: { StockLot: true },
      });
    }

    if (existing) {
      const currentQuantity = (existing.StockLot || []).reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
      throw new ConflictException({
        message: 'Un medicament identique existe deja dans le stock.',
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

    return this.prisma.medication.create({
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

  createStockLot(data: any) {
    return this.prisma.stockLot.create({
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

  prescriptionsToDispense() {
    return this.prisma.prescription.findMany({
      where: {
        deletedAt: null,
        status: { not: 'DISPENSED' },
        patient: { workflowStatus: 'EN_PHARMACIE' },
      },
      include: {
        patient: true,
        prescriber: true,
        lineItems: { include: { medication: { include: { StockLot: true } } } },
        pharmacyDispenses: { include: { lines: { include: { medication: true } }, dispensedBy: true } },
      },
      orderBy: { prescribingDate: 'desc' },
    });
  }

  async dispensePrescription(id: string, body: any, actorId?: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { patient: true, lineItems: { include: { medication: { include: { StockLot: true } } } } },
    });
    if (!prescription) throw new NotFoundException('Prescription introuvable');
    if (prescription.status === 'DISPENSED') throw new BadRequestException('Prescription deja delivree.');

    return this.prisma.$transaction(async (tx) => {
      const dispense = await tx.pharmacyDispense.create({
        data: {
          prescriptionId: id,
          dispensedById: actorId,
          status: 'DISPENSED',
          notes: body?.notes || null,
          location: body?.location || 'Pharmacie',
        },
      });

      for (const line of prescription.lineItems) {
        await this.consumeMedication(tx, line.medicationId, Number(line.quantity || 0), actorId, `Prescription ${id}`);
        const latestLot = line.medication.StockLot.slice().sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
        const unitPrice = Number(latestLot?.purchasePrice || 0);
        await tx.pharmacyDispenseLine.create({
          data: {
            pharmacyDispenseId: dispense.id,
            medicationId: line.medicationId,
            quantity: line.quantity,
            unitPrice,
            totalPrice: unitPrice * Number(line.quantity || 0),
          },
        });
      }

      await tx.prescription.update({ where: { id }, data: { status: 'DISPENSED' } });
      await tx.patient.update({ where: { id: prescription.patientId }, data: { workflowStatus: 'TERMINE' } });
      return tx.pharmacyDispense.findUnique({
        where: { id: dispense.id },
        include: { lines: { include: { medication: true } }, prescription: { include: { patient: true } } },
      });
    });
  }

  async externalSale(body: any, actorId?: string) {
    const lines = Array.isArray(body?.lines) ? body.lines : [];
    if (!lines.length) throw new BadRequestException('Aucun medicament a vendre.');
    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const line of lines) {
        const quantity = Number(line.quantity || 0);
        if (!line.medicationId || quantity <= 0) continue;
        await this.consumeMedication(tx, line.medicationId, quantity, actorId, body?.clientName ? `Vente externe - ${body.clientName}` : 'Vente externe');
        results.push({ medicationId: line.medicationId, quantity });
      }
      return { soldAt: new Date(), clientName: body?.clientName || null, lines: results };
    });
  }

  private async consumeMedication(tx: any, medicationId: string, quantity: number, actorId?: string, reason?: string) {
    if (quantity <= 0) throw new BadRequestException('Quantite invalide.');
    const lots = await tx.stockLot.findMany({
      where: { medicationId, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });
    const available = lots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
    if (available < quantity) {
      throw new BadRequestException('Stock insuffisant pour ce medicament.');
    }

    let remaining = quantity;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const used = Math.min(Number(lot.quantity || 0), remaining);
      await tx.stockLot.update({ where: { id: lot.id }, data: { quantity: Number(lot.quantity || 0) - used } });
      await tx.stockTransaction.create({
        data: {
          medicationId,
          lotId: lot.id,
          type: 'OUT',
          quantity: used,
          performedById: actorId,
          reference: reason,
        },
      });
      remaining -= used;
    }
  }
}
