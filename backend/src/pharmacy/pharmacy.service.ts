import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PatientWorkflowStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicContextService } from '../core/clinic-context.service';

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private requireClinic(actorId?: string) {
    return this.clinicContext.requireOperationalActor({ userId: actorId });
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
    const medications = await this.prisma.medication.findMany({
      where: { deletedAt: null, StockLot: { some: { clinicId: actor.clinicId, quantity: { gt: 0 } } } },
      include: {
        category: { include: { section: true } },
        StockLot: { where: { clinicId: actor.clinicId }, orderBy: { receivedAt: 'desc' } },
        StockTransaction: { where: { clinicId: actor.clinicId }, orderBy: { createdAt: 'desc' }, take: 20 },
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

  async findReadyPrescriptions(actorId?: string) {
    const prescriptions = await this.findPrescriptions(actorId);
    return prescriptions.filter((prescription) => prescription.status !== 'DISPENSED');
  }

  async dispensePrescription(id: string, body: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const paidInvoice = await this.prisma.invoice.findFirst({
      where: {
        clinicId: actor.clinicId,
        remarks: { contains: `Prescription:${id}` },
        status: 'PAID',
      },
    });

    const paidInvoiceLines = paidInvoice ? await this.prisma.invoiceLine.findMany({
      where: { invoiceId: paidInvoice.id },
    }) : [];

    if (!paidInvoice) {
      throw new BadRequestException('La prescription doit être payée avant délivrance.');
    }

    const prescription = await this.prisma.prescription.findFirst({
      where: { id, deletedAt: null, patient: { clinicId: actor.clinicId, deletedAt: null } },
      include: {
        lineItems: { include: { medication: true } },
        patient: true,
        prescriber: true,
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription introuvable.');
    }

    if (prescription.status === 'DISPENSED') {
      throw new BadRequestException('Cette ordonnance a déjà été délivrée.');
    }

    return await this.prisma.$transaction(async (tx) => {
      for (const line of prescription.lineItems) {
        const quantity = Number(line.quantity);
        await this.consumeMedication(tx, line.medicationId, quantity, actor.clinicId, actor.id, `Prescription:${id}`);
      }

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
        where: { id, deletedAt: null, patient: { clinicId: actor.clinicId, deletedAt: null } },
        data: { status: 'DISPENSED' },
      });
      if (prescriptionUpdate.count !== 1) throw new NotFoundException('Prescription introuvable.');

      return tx.pharmacyDispense.findUnique({
        where: { id: dispense.id },
        include: {
          prescription: { include: { patient: true, prescriber: true } },
          dispensedBy: true,
          lines: { include: { medication: true } },
        },
      });
    });
  }

  async createIndependentSale(data: any, actorId?: string) {
    const actor = await this.requireClinic(actorId);
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
      include: { StockLot: { where: { clinicId: actor.clinicId } } },
    });

    if (!medication) {
      throw new NotFoundException('Médicament introuvable.');
    }

    const available = medication.StockLot.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
    if (available < quantity) {
      throw new BadRequestException(`Stock insuffisant pour ${medication.name}.`);
    }

    const lots = await this.prisma.stockLot.findMany({
      where: { medicationId, clinicId: actor.clinicId, quantity: { gt: 0 } },
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
        reference: 'Vente:client externe',
        performedById: actor.id,
        clinicId: actor.clinicId,
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
        where: {
          clinicId: actor.clinicId,
          reference: {
            contains: data?.source || 'PHARMACY',
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      });
    });
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
          prescription: { include: { patient: true, prescriber: true, consultation: true } },
          dispensedBy: true,
          lines: { include: { medication: true } },
        },
        orderBy: { dispensedAt: 'desc' },
      }),
      this.prisma.stockTransaction.findMany({
        where: { clinicId: actor.clinicId, type: { in: ['SALE', 'OUT'] } },
        include: {
          medication: true,
          performedBy: true,
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
    const prescription = await this.prisma.prescription.findFirst({
      where: { id, deletedAt: null, patient: { clinicId: actor.clinicId, deletedAt: null } },
      include: {
        pharmacyDispenses: {
          include: {
            lines: true,
          },
        },
      },
    });

    if (!prescription) {
      throw new NotFoundException('Prescription introuvable.');
    }

    const activeDispense = prescription.pharmacyDispenses.find((dispense) => dispense.status !== 'CANCELLED');
    if (!activeDispense) {
      throw new BadRequestException('Aucune délivrance active à annuler pour cette prescription.');
    }

    const now = Date.now();
    const createdAt = new Date(prescription.createdAt).getTime();
    const hasDoctorModification = Number(prescription.version || 0) > 1;
    const withinEditWindow = now - createdAt <= 24 * 60 * 60 * 1000;

    if (!hasDoctorModification || !withinEditWindow) {
      throw new BadRequestException('La délivrance ne peut être annulée que si le médecin a modifié la prescription avant la délivrance et dans les 24h.');
    }

    return this.prisma.$transaction(async (tx) => {
      const consumedTransactions = await tx.stockTransaction.findMany({
        where: {
          type: 'OUT',
          clinicId: actor.clinicId,
          reference: { contains: `Prescription:${id}` },
          createdAt: {
            gte: activeDispense.dispensedAt,
            lt: new Date(activeDispense.dispensedAt.getTime() + 5 * 60 * 1000),
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const fallbackTransactions = consumedTransactions.length === 0
        ? await tx.stockTransaction.findMany({
            where: {
              type: 'OUT',
              clinicId: actor.clinicId,
              createdAt: {
                gte: activeDispense.dispensedAt,
                lt: new Date(activeDispense.dispensedAt.getTime() + 5 * 60 * 1000),
              },
            },
            orderBy: { createdAt: 'asc' },
          })
        : [];

      const transactionsToRestore = consumedTransactions.length > 0 ? consumedTransactions : fallbackTransactions;

      if (transactionsToRestore.length === 0) {
        throw new BadRequestException('Aucune transaction de stock à annuler pour cette délivrance.');
      }

      for (const transaction of transactionsToRestore) {
        const lot = transaction.lotId
          ? await tx.stockLot.findFirst({ where: { id: transaction.lotId, clinicId: actor.clinicId } })
          : null;

        if (!lot) {
          continue;
        }

        const restoredQuantity = Math.abs(Number(transaction.quantity || 0));
        await tx.stockLot.update({
          where: { id: lot.id },
          data: { quantity: Number(lot.quantity || 0) + restoredQuantity },
        });

        await tx.stockTransaction.create({
          data: {
            medicationId: transaction.medicationId,
            lotId: lot.id,
            type: 'IN',
            quantity: restoredQuantity,
            unitPrice: transaction.unitPrice,
            reference: `Annulation délivrance:${id}`,
            performedById: actor.id,
            clinicId: actor.clinicId,
          },
        });
      }

      await tx.pharmacyDispense.updateMany({
        where: { id: activeDispense.id, clinicId: actor.clinicId },
        data: { status: 'CANCELLED', notes: `${activeDispense.notes || ''} | Annulé`.trim() || 'Annulé' },
      });

      await tx.prescription.updateMany({
        where: { id, deletedAt: null, patient: { clinicId: actor.clinicId, deletedAt: null } },
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
      this.prisma.stockTransaction.findMany({ where: { clinicId: actor.clinicId }, include: { medication: true, lot: true, performedBy: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
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
        prescriber: true,
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
            dispensedBy: true,
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
    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const line of lines) {
        const quantity = Number(line.quantity || 0);
        if (!line.medicationId || quantity <= 0) continue;
        await this.consumeMedication(tx, line.medicationId, quantity, actor.clinicId, actor.id, body?.clientName ? `Vente externe - ${body.clientName}` : 'Vente externe');
        results.push({ medicationId: line.medicationId, quantity });
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
  ) {
    if (quantity <= 0) throw new BadRequestException('Quantite invalide.');
    const lots = await tx.stockLot.findMany({
      where: { medicationId, clinicId, quantity: { gt: 0 } },
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
          clinicId,
          reference: reason,
        },
      });
      remaining -= used;
    }
  }
}
