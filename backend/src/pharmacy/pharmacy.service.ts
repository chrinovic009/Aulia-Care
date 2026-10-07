import { BadRequestException, Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PatientWorkflowStatus, Prisma, RoleSlug } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../core/public-user-select';
import { ClinicContextService } from '../core/clinic-context.service';
import { SetMedicationSalePriceDto } from './dto/set-medication-sale-price.dto';

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private requireClinic(actorId?: string) {
    return this.clinicContext.requireOperationalActor({ userId: actorId });
  }

  async getSalePrice(medicationId: string, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.medicationSalePrice.findUnique({
      where: { clinicId_medicationId: { clinicId: actor.clinicId, medicationId } },
      select: { medicationId: true, amount: true, currency: true, updatedAt: true },
    });
  }

  async setSalePrice(medicationId: string, dto: SetMedicationSalePriceDto, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    if (actor.primaryRole !== RoleSlug.ADMIN && actor.primaryRole !== RoleSlug.PHARMACIST) {
      throw new ForbiddenException('Seuls l’administrateur et le pharmacien peuvent fixer le tarif de vente.');
    }
    if (typeof dto.amount !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(dto.amount)) {
      throw new BadRequestException('Un tarif de vente CDF positif avec au plus deux décimales est requis.');
    }
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) {
      throw new BadRequestException('Un tarif de vente CDF positif avec au plus deux décimales est requis.');
    }
    const medication = await this.prisma.medication.findFirst({
      where: { id: medicationId, deletedAt: null }, select: { id: true },
    });
    if (!medication) throw new NotFoundException('Médicament introuvable.');
    return this.prisma.$transaction(async (tx) => {
      const key = { clinicId: actor.clinicId, medicationId };
      const before = await tx.medicationSalePrice.findUnique({ where: { clinicId_medicationId: key } });
      const price = await tx.medicationSalePrice.upsert({
        where: { clinicId_medicationId: key },
        create: { ...key, amount, currency: 'CDF' },
        update: { amount },
      });
      await tx.auditTrail.create({
        data: {
          actorId: actor.id,
          entity: 'MedicationSalePrice',
          entityId: price.id,
          action: before ? 'UPDATE' : 'CREATE',
          before: before ? { clinicId: actor.clinicId, medicationId, amount: before.amount.toString() } : undefined,
          after: { clinicId: actor.clinicId, medicationId, amount: price.amount.toString(), currency: 'CDF' },
        },
      });
      return price;
    });
  }

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

  async findAvailable(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const eligibleLot = { clinicId: actor.clinicId, quantity: { gt: 0 }, expiryDate: { gte: todayUtc } };
    const medications = await this.prisma.medication.findMany({
      where: { deletedAt: null, StockLot: { some: eligibleLot } },
      include: {
        category: { include: { section: true } },
        StockLot: { where: eligibleLot, orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }] },
        StockTransaction: { where: { clinicId: actor.clinicId }, orderBy: { createdAt: 'desc' }, take: 20 },
        salePrices: { where: { clinicId: actor.clinicId }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });

    return medications
      .map((medication) => {
        const quantity = medication.StockLot.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
        return {
          ...medication,
          availableQuantity: quantity,
          // Acquisition cost is not a patient-facing sale tariff.
          unitPrice: medication.salePrices[0]?.amount ?? null,
          lots: medication.StockLot,
        };
      })
      .filter((medication) => medication.availableQuantity > 0);
  }

  async findPrescriptions(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const patients = await this.prisma.patient.findMany({
      where: { deletedAt: null, clinicId: actor.clinicId },
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
      where: { deletedAt: null, patient: { clinicId: actor.clinicId, deletedAt: null } },
      include: {
        patient: true,
        prescriber: { select: PUBLIC_USER_SELECT },
        consultation: true,
        lineItems: { include: { medication: true } },
        pharmacyDispenses: { include: { dispensedBy: { select: PUBLIC_USER_SELECT }, lines: { include: { medication: true } } } },
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

  async findReadyPrescriptions(actorId?: string) {
    const prescriptions = await this.findPrescriptions(actorId);
    return prescriptions.filter((prescription) => prescription.status !== 'DISPENSED');
  }

  async dispensePrescription(id: string, body: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return await this.prisma.$transaction(async (tx) => {
      // Serialize all dispenses and cancellations for this prescription.
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Prescription" WHERE "id" = ${id} AND "clinicId" = ${actor.clinicId} FOR UPDATE
      `);
      if (!locked.length) throw new NotFoundException('Prescription introuvable.');
      const prescription = await tx.prescription.findFirst({
        where: { id, clinicId: actor.clinicId, deletedAt: null, patient: { clinicId: actor.clinicId, deletedAt: null } },
        include: { lineItems: { where: { deletedAt: null }, include: { medication: true } } },
      });
      if (!prescription) throw new NotFoundException('Prescription introuvable.');
      if (prescription.status === 'DISPENSED' || prescription.status === 'CANCELLED') {
        throw new BadRequestException('Cette ordonnance n’est plus délivrable.');
      }
      if (!prescription.lineItems.length) throw new BadRequestException('Ordonnance sans ligne active.');
      const activeDispense = await tx.pharmacyDispense.findFirst({
        where: { prescriptionId: id, clinicId: actor.clinicId, status: { not: 'CANCELLED' }, deletedAt: null },
        select: { id: true },
      });
      if (activeDispense) throw new ConflictException('Cette ordonnance a déjà une délivrance active.');
      const paidInvoice = await tx.invoice.findFirst({
        where: { clinicId: actor.clinicId, patientId: prescription.patientId, deletedAt: null,
          OR: [
            { prescriptionId: id, prescriptionVersion: prescription.version },
            { prescriptionId: null, remarks: `Prescription:${id}` },
          ], status: { in: ['PAID', 'COVERED'] } },
        select: { id: true },
      });
      if (!paidInvoice) throw new BadRequestException('La prescription doit être payée avant délivrance.');
      const paidInvoiceLines = await tx.invoiceLine.findMany({ where: { invoiceId: paidInvoice.id } });

      const dispense = await tx.pharmacyDispense.create({
        data: {
          prescriptionId: prescription.id,
          clinicId: actor.clinicId,
          dispensedById: actor.id,
          status: 'DISPENSED',
          notes: body?.notes || null,
          location: body?.location || null,
        },
      });

      // Lock medications in a stable order across prescription and sale paths.
      for (const line of [...prescription.lineItems].sort((left, right) => left.medicationId.localeCompare(right.medicationId))) {
        await this.consumeMedication(tx, line.medicationId, line.quantity, actor.clinicId, actor.id,
          `Prescription:${id}`, dispense.id);
      }

      await Promise.all(
        prescription.lineItems.map(async (line) => {
          const invoiceLine = paidInvoiceLines.find((item: any) => {
            const label = String(item.label || '').toLowerCase();
            const medicationName = String(line.medication?.name || '').toLowerCase();
            return label.includes(medicationName) || label.includes(String(line.dosage || '').toLowerCase());
          });

          const unitPrice = Number(invoiceLine?.unitPrice ?? 0);
          const quantity = Number(line.quantity || 0);
          const totalPrice = Number(invoiceLine?.totalAmount ?? unitPrice * quantity);

          await tx.pharmacyDispenseLine.create({
            data: {
              pharmacyDispenseId: dispense.id,
              medicationId: line.medicationId,
              quantity,
              unitPrice,
              totalPrice,
            },
          });
        }),
      );

      const prescriptionUpdate = await tx.prescription.updateMany({
        where: { id, clinicId: actor.clinicId, status: prescription.status, deletedAt: null },
        data: { status: 'DISPENSED' },
      });
      if (prescriptionUpdate.count !== 1) throw new NotFoundException('Prescription introuvable.');

      return tx.pharmacyDispense.findUnique({
        where: { id: dispense.id },
        include: {
          prescription: { include: { patient: true, prescriber: { select: PUBLIC_USER_SELECT } } },
          dispensedBy: { select: PUBLIC_USER_SELECT },
          lines: { include: { medication: true } },
        },
      });
    });
  }

  async createIndependentSale(data: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const medicationId = typeof data?.medicationId === 'string' ? data.medicationId : '';
    const quantity = Number(data?.quantity);
    if (!medicationId || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Médicament et quantité requis.');
    }
    return this.prisma.$transaction((tx) =>
      this.consumeMedication(tx, medicationId, quantity, actor.clinicId, actor.id, 'Vente:client externe'),
    );
  }

  async getHistory(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const toNumber = (value: unknown) => {
      if (value == null) return 0;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return Number(value || 0);
      if (typeof value === 'object' && 'toString' in value) {
        const text = String((value as { toString: () => string }).toString());
        return Number(text || 0);
      }
      return Number(value || 0);
    };

    const [dispenses, sales, invoices] = await Promise.all([
      this.prisma.pharmacyDispense.findMany({
        where: { deletedAt: null, clinicId: actor.clinicId },
        include: {
          prescription: { include: { patient: true, prescriber: { select: PUBLIC_USER_SELECT }, consultation: true } },
          dispensedBy: { select: PUBLIC_USER_SELECT },
          lines: { include: { medication: true } },
        },
        orderBy: { dispensedAt: 'desc' },
      }),
      this.prisma.stockTransaction.findMany({
        where: { clinicId: actor.clinicId, type: { in: ['SALE', 'OUT'] } },
        include: {
          medication: true,
          performedBy: { select: PUBLIC_USER_SELECT },
          lot: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { clinicId: actor.clinicId, deletedAt: null, remarks: { contains: 'Prescription:' } },
      }),
    ]);

    const invoiceLinesByInvoiceId = new Map<string, any[]>();
    const invoiceByPrescriptionId = new Map<string, any>();

    for (const invoice of invoices) {
      const prescriptionMatch = invoice.remarks?.match(/Prescription:([a-zA-Z0-9-]+)/);
      if (prescriptionMatch?.[1]) {
        invoiceByPrescriptionId.set(prescriptionMatch[1], invoice);
      }

      const lines = await this.prisma.invoiceLine.findMany({
        where: { invoiceId: invoice.id },
      });
      invoiceLinesByInvoiceId.set(invoice.id, lines);
    }

    const dispenseRecords = dispenses.map((dispense) => {
      const patientName = [dispense.prescription?.patient?.firstName, dispense.prescription?.patient?.lastName]
        .filter(Boolean)
        .join(' ') || 'Patient inconnu';

      const consultationTitle = [
        dispense.prescription?.consultation?.chiefComplaint,
        dispense.prescription?.consultation?.diagnosis,
        dispense.prescription?.consultation?.clinicalSummary,
      ].find(Boolean) || 'Consultation';
      const normalizedConsultationTitle = String(consultationTitle).trim().replace(/\s+/g, ' ');

      const invoice = invoiceByPrescriptionId.get(dispense.prescriptionId);
      const fallbackInvoiceLines = invoice ? invoiceLinesByInvoiceId.get(invoice.id) || [] : [];
      const lines = dispense.lines.length > 0 ? dispense.lines : fallbackInvoiceLines;

      const medicationNames = lines
        .map((line: any) => line.medication?.name || line.label || 'Médicament')
        .filter(Boolean)
        .slice(0, 3);
      const medicinesLabel = medicationNames.length > 0 ? medicationNames.join(', ') : 'Médicament';
      const quantity = lines.reduce((sum, line: any) => sum + toNumber(line.quantity || 0), 0);
      const invoiceAmount = invoice ? toNumber(invoice.totalAmount || 0) : 0;
      const amount = invoiceAmount > 0
        ? invoiceAmount
        : lines.reduce((sum, line: any) => {
            const totalPrice = toNumber(line.totalPrice ?? line.amount ?? 0);
            const unitPrice = toNumber(line.unitPrice ?? 0);
            const qty = toNumber(line.quantity || 0);
            if (totalPrice > 0) return sum + totalPrice;
            if (unitPrice > 0 && qty > 0) return sum + unitPrice * qty;
            return sum;
          }, 0);
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
        reference: `Prescription:${normalizedConsultationTitle}`,
        actorName,
        status: dispense.status || 'DISPENSED',
        notes: dispense.notes || null,
        trace: `Ordonnance ${dispense.prescriptionId}`,
      };
    });

    const saleRecords = sales.map((sale) => {
      const actorName = sale.performedBy?.displayName || [sale.performedBy?.firstName, sale.performedBy?.lastName].filter(Boolean).join(' ') || 'Inconnu';
      const quantity = Math.abs(toNumber(sale.quantity || 0));
      const amount = toNumber(sale.unitPrice || 0) * quantity;
      const isDirectSale = sale.type === 'SALE' || /vente/i.test(sale.reference || '') || /sale/i.test(sale.reference || '');

      return {
        id: sale.id,
        type: isDirectSale ? 'SALE' : 'DISPENSE',
        typeLabel: isDirectSale ? 'Vente directe' : 'Sortie stock',
        createdAt: sale.createdAt?.toISOString(),
        patientName: isDirectSale ? 'Vente directe' : 'Sortie stock',
        medicationName: sale.medication?.name || 'Médicament',
        quantity,
        amount,
        reference: sale.reference || (isDirectSale ? 'Vente:client externe' : 'Sortie stock'),
        actorName,
        status: 'COMPLETED',
        notes: sale.reference || null,
        trace: `Lot ${sale.lotId || 'n/a'}`,
      };
    });

    return [...dispenseRecords, ...saleRecords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async cancelDispense(id: string, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Prescription" WHERE "id" = ${id} AND "clinicId" = ${actor.clinicId} FOR UPDATE
      `);
      if (!locked.length) throw new NotFoundException('Prescription introuvable.');
      const prescription = await tx.prescription.findFirst({
        where: { id, clinicId: actor.clinicId, deletedAt: null, patient: { clinicId: actor.clinicId, deletedAt: null } },
        select: { id: true, createdAt: true, version: true },
      });
      if (!prescription) throw new NotFoundException('Prescription introuvable.');
      const activeDispense = await tx.pharmacyDispense.findFirst({
        where: { prescriptionId: id, clinicId: actor.clinicId, status: 'DISPENSED', deletedAt: null },
        select: { id: true, notes: true },
      });
      if (!activeDispense) throw new BadRequestException('Aucune délivrance active à annuler pour cette prescription.');
      const withinEditWindow = Date.now() - prescription.createdAt.getTime() <= 24 * 60 * 60 * 1000;
      if (prescription.version <= 1 || !withinEditWindow) {
        throw new BadRequestException('La délivrance ne peut être annulée que si le médecin a modifié la prescription et dans les 24h.');
      }
      const movements = await tx.stockTransaction.findMany({
        where: { pharmacyDispenseId: activeDispense.id, clinicId: actor.clinicId, type: 'OUT' },
        orderBy: { id: 'asc' },
      });
      if (!movements.length || movements.some((movement) => !movement.lotId || !Number.isSafeInteger(movement.quantity) || movement.quantity <= 0)) {
        throw new ConflictException('Mouvements de stock non attribuables à cette délivrance. Réconciliation manuelle requise.');
      }
      const claimed = await tx.pharmacyDispense.updateMany({
        where: { id: activeDispense.id, clinicId: actor.clinicId, status: 'DISPENSED' },
        data: { status: 'CANCELLED', notes: `${activeDispense.notes || ''} | Annulé`.trim() },
      });
      if (claimed.count !== 1) throw new ConflictException('Cette délivrance a déjà été annulée.');
      for (const movement of movements) {
        const restored = await tx.stockLot.updateMany({
          where: { id: movement.lotId!, clinicId: actor.clinicId, medicationId: movement.medicationId },
          data: { quantity: { increment: movement.quantity } },
        });
        if (restored.count !== 1) throw new ConflictException('Lot de stock introuvable pour la restitution.');
        await tx.stockTransaction.create({
          data: { medicationId: movement.medicationId, lotId: movement.lotId,
            pharmacyDispenseId: activeDispense.id, type: 'IN', quantity: movement.quantity,
            unitPrice: movement.unitPrice, reference: `Annulation délivrance:${id}`,
            performedById: actor.id, clinicId: actor.clinicId },
        });
      }
      await tx.prescription.updateMany({
        where: { id, clinicId: actor.clinicId, status: 'DISPENSED', deletedAt: null },
        data: { status: 'PRESCRIBED' },
      });
      return { cancelled: true, prescriptionId: id };
    });
  }

  async findOne(id: string) {
    const medication = await this.prisma.medication.findUnique({ where: { id } });
    if (!medication) {
      throw new NotFoundException('Médicament introuvable');
    }
    return medication;
  }

  async stockCatalog(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const [medications, lots, transactions, dispenses] = await Promise.all([
      this.prisma.medication.findMany({
        where: { deletedAt: null, StockLot: { some: { clinicId: actor.clinicId } } },
        include: { category: { include: { section: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.stockLot.findMany({
        where: { clinicId: actor.clinicId },
        include: {
          medication: {
            include: { category: { include: { section: true } } },
          },
        },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'desc' }],
      }),
      this.prisma.stockTransaction.findMany({ where: { clinicId: actor.clinicId }, include: { medication: true, lot: true, performedBy: { select: PUBLIC_USER_SELECT } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.pharmacyDispense.findMany({ where: { clinicId: actor.clinicId, deletedAt: null }, include: { prescription: { include: { patient: true } }, lines: { include: { medication: true } } }, orderBy: { dispensedAt: 'desc' }, take: 50 }),
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

  async createStockLot(data: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const medicationId = String(data?.medicationId || '');
    const medication = medicationId
      ? await this.prisma.medication.findFirst({
          where: { id: medicationId, deletedAt: null },
          select: { id: true },
        })
      : null;
    if (!medication) throw new NotFoundException('Médicament introuvable.');
    return this.prisma.stockLot.create({
      data: {
        medicationId: medication.id,
        clinicId: actor.clinicId,
        batchNumber: data.batchNumber,
        quantity: Number(data.quantity || 0),
        purchasePrice: data.purchasePrice ? Number(data.purchasePrice) : null,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      },
      include: { medication: true },
    });
  }

  async prescriptionsToDispense(actorId?: string) {
    const actor = await this.requireClinic(actorId);

    return this.prisma.prescription.findMany({
      where: {
        deletedAt: null,
        status: { not: 'DISPENSED' },
        patient: {
          clinicId: actor.clinicId,
          deletedAt: null,
          workflowStatus: 'EN_PHARMACIE',
        },
      },
      include: {
        patient: true,
        prescriber: { select: PUBLIC_USER_SELECT },
        lineItems: {
          include: {
            medication: {
              include: {
                StockLot: {
                  where: {
                    clinicId: actor.clinicId,
                  },
                },
              },
            },
          },
        },
        pharmacyDispenses: {
          include: {
            lines: {
              include: {
                medication: true,
              },
            },
            dispensedBy: { select: PUBLIC_USER_SELECT },
          },
        },
      },
      orderBy: {
        prescribingDate: 'desc',
      },
    });
  }

  async externalSale(body: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const lines = Array.isArray(body?.lines) ? body.lines : [];
    if (!lines.length) throw new BadRequestException('Aucun medicament a vendre.');
    const validatedLines = lines.map((line: { medicationId?: unknown; quantity?: unknown }) => {
      const medicationId = typeof line.medicationId === 'string' ? line.medicationId.trim() : '';
      const quantity = Number(line.quantity);
      if (!medicationId || !Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new BadRequestException('Chaque vente externe requiert un médicament et une quantité entière positive.');
      }
      return { medicationId, quantity };
    }).sort((a, b) => a.medicationId.localeCompare(b.medicationId));
    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const line of validatedLines) {
        await this.consumeMedication(tx, line.medicationId, line.quantity, actor.clinicId, actor.id, body?.clientName ? `Vente externe - ${body.clientName}` : 'Vente externe');
        results.push(line);
      }
      return { soldAt: new Date(), clientName: body?.clientName || null, lines: results };
    });
  }

  private async consumeMedication(
    tx: Prisma.TransactionClient,
    medicationId: string,
    quantity: number,
    clinicId: string,
    actorId: string,
    reason?: string,
    pharmacyDispenseId?: string,
  ) {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('La quantité doit être un entier positif fini.');
    }
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    // FEFO: an expiry date remains usable through that UTC calendar day.
    // Undated lots are not eligible for dispensing until a date is recorded.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "StockLot"
      WHERE "medicationId" = ${medicationId}
        AND "clinicId" = ${clinicId}
        AND "quantity" > 0
        AND "expiryDate" >= ${todayUtc}
      ORDER BY "expiryDate" ASC, "receivedAt" ASC, "id" ASC
      FOR UPDATE
    `);
    const lotIds = locked.map((lot) => lot.id);
    const lots = await tx.stockLot.findMany({
      where: { id: { in: lotIds }, medicationId, clinicId, quantity: { gt: 0 }, expiryDate: { gte: todayUtc } },
    });
    const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
    const available = lots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
    if (available < quantity) {
      throw new BadRequestException('Stock insuffisant pour ce medicament.');
    }

    let remaining = quantity;
    const movements = [];
    for (const lotId of lotIds) {
      if (remaining <= 0) break;
      const lot = lotsById.get(lotId);
      if (!lot) throw new ConflictException('Le lot de stock a changé pendant la délivrance.');
      const used = Math.min(Number(lot.quantity || 0), remaining);
      const updated = await tx.stockLot.updateMany({
        where: { id: lot.id, medicationId, clinicId, quantity: { gte: used } },
        data: { quantity: { decrement: used } },
      });
      if (updated.count !== 1) throw new ConflictException('Le stock a changé pendant la délivrance.');
      const movement = await tx.stockTransaction.create({
        data: {
          medicationId,
          lotId: lot.id,
          type: 'OUT',
          quantity: used,
          performedById: actorId,
          clinicId,
          reference: reason,
          pharmacyDispenseId,
        },
      });
      movements.push(movement);
      remaining -= used;
    }
    return movements;
  }
}
