import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PharmacyService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.medication.findMany({ include: { category: { include: { section: true } } }, orderBy: { name: 'asc' } });
  }

  catalogue(sectionId?: string, categoryId?: string, query?: string) {
    const normalizedQuery = String(query || '').trim();
    return this.prisma.medicationSection.findMany({
      where: sectionId ? { id: sectionId } : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        categories: {
          where: categoryId ? { id: categoryId } : { active: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            medications: {
              where: { deletedAt: null, ...(normalizedQuery ? { OR: [{ name: { contains: normalizedQuery, mode: 'insensitive' } }, { code: { contains: normalizedQuery, mode: 'insensitive' } }] } : {}) },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
  }

  async createSection(data: any) {
    const name = String(data?.name || '').trim();
    const code = String(data?.code || '').trim().toUpperCase();
    if (!name || !code) throw new BadRequestException('Le nom et le code de la section sont requis.');
    return this.prisma.medicationSection.create({ data: { name, code, description: data?.description || null, sortOrder: Number(data?.sortOrder || 0) } });
  }

  async createCategory(data: any) {
    const sectionId = String(data?.sectionId || '');
    const name = String(data?.name || '').trim();
    const code = String(data?.code || '').trim().toUpperCase();
    if (!sectionId || !name || !code) throw new BadRequestException('sectionId, nom et code sont requis.');
    return this.prisma.medicationCategory.create({ data: { sectionId, name, code, description: data?.description || null, sortOrder: Number(data?.sortOrder || 0) } });
  }

  async findAvailable() {
    const medications = await this.prisma.medication.findMany({
      where: { deletedAt: null },
      include: {
        category: { include: { section: true } },
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

  async dispensePrescription(id: string, body: any, actorId?: string) {
    // 1. Vérifier que l'ordonnance est bien payée d'abord
    const paidInvoice = await this.prisma.invoice.findFirst({
      where: {
        remarks: { contains: `Prescription:${id}` },
        status: 'PAID',
      },
    });

    if (!paidInvoice) {
      throw new BadRequestException('La prescription doit être payée avant délivrance.');
    }

    // 2. Récupérer l'ordonnance et ses lignes
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { lineItems: true }
    });

    if (!prescription) {
      throw new NotFoundException('Prescription introuvable.');
    }

    if (prescription.status === 'DISPENSED') {
      throw new BadRequestException('Cette ordonnance a déjà été délivrée.');
    }

    // 3. Consommer le stock et enregistrer la transaction
    return await this.prisma.$transaction(async (tx) => {
      // Votre logique de boucle de déstockage existante...
      for (const line of prescription.lineItems) {
        const quantity = Number(line.quantity);
        await this.consumeMedication(tx, line.medicationId, quantity, actorId, 'Délivrance ordonnance');
      }

      // Mettre à jour le statut de l'ordonnance
      return tx.prescription.update({
        where: { id },
        data: { status: 'DISPENSED' }
      });
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

  async getHistory() {
    const [dispenses, sales] = await Promise.all([
      this.prisma.pharmacyDispense.findMany({
        where: { deletedAt: null },
        include: {
          prescription: { include: { patient: true, prescriber: true } },
          dispensedBy: true,
          lines: { include: { medication: true } },
        },
        orderBy: { dispensedAt: 'desc' },
      }),
      this.prisma.stockTransaction.findMany({
        where: { type: 'SALE' },
        include: {
          medication: true,
          performedBy: true,
          lot: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const dispenseRecords = dispenses.map((dispense) => {
      const patientName = [dispense.prescription?.patient?.firstName, dispense.prescription?.patient?.lastName]
        .filter(Boolean)
        .join(' ') || 'Patient inconnu';
      const medicationNames = dispense.lines.map((line) => line.medication?.name || 'Médicament').slice(0, 3);
      const medicinesLabel = medicationNames.length > 0 ? medicationNames.join(', ') : 'Médicament';
      const quantity = dispense.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
      const amount = dispense.lines.reduce((sum, line) => sum + Number(line.totalPrice || 0), 0);
      const actorName = dispense.dispensedBy?.displayName || [dispense.dispensedBy?.firstName, dispense.dispensedBy?.lastName].filter(Boolean).join(' ') || 'Inconnu';

      return {
        id: dispense.id,
        type: 'DISPENSE',
        typeLabel: 'Délivrance',
        createdAt: dispense.dispensedAt?.toISOString() || dispense.createdAt?.toISOString(),
        patientName,
        medicationName: medicinesLabel,
        quantity,
        amount,
        reference: `Prescription:${dispense.prescriptionId}`,
        actorName,
        status: dispense.status || 'DISPENSED',
        notes: dispense.notes || null,
        trace: `Ordonnance ${dispense.prescriptionId}`,
      };
    });

    const saleRecords = sales.map((sale) => {
      const actorName = sale.performedBy?.displayName || [sale.performedBy?.firstName, sale.performedBy?.lastName].filter(Boolean).join(' ') || 'Inconnu';
      const quantity = Math.abs(Number(sale.quantity || 0));
      const amount = Number(sale.unitPrice || 0) * quantity;
      return {
        id: sale.id,
        type: 'SALE',
        typeLabel: 'Vente directe',
        createdAt: sale.createdAt?.toISOString(),
        patientName: 'Vente directe',
        medicationName: sale.medication?.name || 'Médicament',
        quantity,
        amount,
        reference: sale.reference || 'Vente indépendante',
        actorName,
        status: 'COMPLETED',
        notes: sale.reference || null,
        trace: `Lot ${sale.lotId || 'n/a'}`,
      };
    });

    return [...dispenseRecords, ...saleRecords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
      this.prisma.medication.findMany({
        where: { deletedAt: null },
        include: { category: { include: { section: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.stockLot.findMany({
        include: {
          medication: {
            include: { category: { include: { section: true } } },
          },
        },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'desc' }],
      }),
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
    const categoryId = data.categoryId ? String(data.categoryId) : null;

    if (!code || !name || !unit) {
      throw new BadRequestException('Le code, le nom et l unite du medicament sont requis.');
    }
    if (categoryId) {
      const category = await this.prisma.medicationCategory.findUnique({ where: { id: categoryId } });
      if (!category || !category.active) throw new BadRequestException('La catégorie de médicament est introuvable ou inactive.');
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
        categoryId,
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
