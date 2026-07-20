import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PatientWorkflowStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

const normalizeEmail = (value?: string | null) => {
  const email = String(value || '').trim().toLowerCase();
  return email || undefined;
};

const normalizePhone = (value?: string | null) => {
  const phone = String(value || '').trim();
  return phone || undefined;
};

const normalizeText = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async findCompanies() {
    return this.prisma.subscriptionCompany.findMany({
      where: { deletedAt: null },
      include: {
        employees: { where: { deletedAt: null }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
        monthlyInvoices: { where: { deletedAt: null }, orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 6 },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCompany(dto: any) {
    if (!dto?.name?.trim()) throw new BadRequestException('Le nom de l entreprise est obligatoire.');
    const created = await (this.prisma as any).subscriptionCompany.create({
      data: {
        name: dto.name.trim(),
        legalName: dto.legalName?.trim() || dto.name.trim(),
        registrationNumber: dto.registrationNumber?.trim() || null,
        taxNumber: dto.taxNumber?.trim() || null,
        address: dto.address?.trim() || null,
        phone: normalizePhone(dto.phone) || null,
        email: normalizeEmail(dto.email) || null,
        contactName: dto.contactName?.trim() || null,
        contactPhone: normalizePhone(dto.contactPhone) || null,
        contactEmail: normalizeEmail(dto.contactEmail) || null,
        contractNumber: dto.contractNumber?.trim() || `SUB-${Date.now()}`,
        billingDay: Number(dto.billingDay || 30),
        creditLimit: dto.creditLimit ? Number(dto.creditLimit) : null,
        status: dto.status || 'ACTIVE',
      },
    });
    this.notificationsGateway.notify('subscription.company.created', created);
    return created;
  }

  /**
   * Receives the structured result of a document-AI provider. Parsing a PDF and
   * committing clinical/billing identities are deliberately separate steps: the
   * receptionist can review this payload before one atomic database transaction.
   */
  async importExtractedCompany(payload: any, actorId?: string) {
    const company = payload?.company;
    const employees = Array.isArray(payload?.employees) ? payload.employees : [];
    const contractNumber = String(company?.contractNumber || '').trim();
    if (!company?.name?.trim() || !contractNumber) {
      throw new BadRequestException('Le nom de l entreprise et le numero de contrat sont obligatoires.');
    }
    if (!employees.length) throw new BadRequestException('Le document ne contient aucun employé exploitable.');

    const normalizedEmployees = employees.map((employee: any, index: number) => {
      const firstName = String(employee?.firstName || '').trim();
      const lastName = String(employee?.lastName || '').trim();
      const policyNumber = String(employee?.policyNumber || '').trim();
      if (!firstName || !lastName || !policyNumber) {
        throw new BadRequestException(`Employé ${index + 1}: nom, prénom et numéro de police sont requis.`);
      }
      return {
        firstName,
        lastName,
        middleName: String(employee?.middleName || '').trim() || null,
        gender: employee?.gender || null,
        profession: String(employee?.profession || '').trim() || null,
        dateOfBirth: employee?.dateOfBirth ? new Date(employee.dateOfBirth) : null,
        age: Number.isFinite(Number(employee?.age)) ? Number(employee.age) : null,
        phone: normalizePhone(employee?.phone) || null,
        email: normalizeEmail(employee?.email) || null,
        address: String(employee?.address || '').trim() || null,
        nationality: String(employee?.nationality || '').trim() || null,
        policyNumber,
        employeeNumber: String(employee?.employeeNumber || '').trim() || null,
      };
    });
    if (new Set(normalizedEmployees.map((employee: any) => employee.policyNumber)).size !== normalizedEmployees.length) {
      throw new BadRequestException('Le document contient des numéros de police en double.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await (tx as any).subscriptionCompany.findUnique({ where: { contractNumber } });
      if (existing && !payload?.allowExistingCompany) {
        throw new BadRequestException('Cette entreprise existe déjà. Confirmez explicitement la mise à jour avant un nouvel import.');
      }
      const savedCompany = existing
        ? await (tx as any).subscriptionCompany.update({ where: { id: existing.id }, data: { name: company.name.trim(), legalName: company.legalName?.trim() || company.name.trim(), registrationNumber: company.registrationNumber?.trim() || null, taxNumber: company.taxNumber?.trim() || null, address: company.address?.trim() || null, phone: normalizePhone(company.phone) || null, email: normalizeEmail(company.email) || null, contactName: company.contactName?.trim() || null, contactPhone: normalizePhone(company.contactPhone) || null, contactEmail: normalizeEmail(company.contactEmail) || null, billingDay: Number(company.billingDay || 30), creditLimit: company.creditLimit ? Number(company.creditLimit) : null, status: company.status || 'ACTIVE' } })
        : await (tx as any).subscriptionCompany.create({ data: { name: company.name.trim(), legalName: company.legalName?.trim() || company.name.trim(), registrationNumber: company.registrationNumber?.trim() || null, taxNumber: company.taxNumber?.trim() || null, address: company.address?.trim() || null, phone: normalizePhone(company.phone) || null, email: normalizeEmail(company.email) || null, contactName: company.contactName?.trim() || null, contactPhone: normalizePhone(company.contactPhone) || null, contactEmail: normalizeEmail(company.contactEmail) || null, contractNumber, billingDay: Number(company.billingDay || 30), creditLimit: company.creditLimit ? Number(company.creditLimit) : null, status: company.status || 'ACTIVE' } });

      const importResult = await (tx as any).subscriptionEmployee.createMany({
        data: normalizedEmployees.map((employee: any) => ({ ...employee, companyId: savedCompany.id, status: 'ACTIVE' })),
        skipDuplicates: true,
      });
      await tx.auditTrail.create({ data: { actorId: actorId || null, entity: 'SubscriptionCompany', entityId: savedCompany.id, action: 'CREATE', after: { source: 'DOCUMENT_AI_REVIEWED', employeeCount: importResult.count } } as any });
      return { company: savedCompany, employeesCreated: importResult.count, employeesIgnored: normalizedEmployees.length - importResult.count };
    });
    this.notificationsGateway.notify('subscription.company.imported', result);
    return result;
  }

  async updateCompany(id: string, dto: any) {
    await this.getCompany(id);
    const updated = await (this.prisma as any).subscriptionCompany.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name?.trim() } : {}),
        ...(dto.legalName !== undefined ? { legalName: dto.legalName?.trim() || null } : {}),
        ...(dto.registrationNumber !== undefined ? { registrationNumber: dto.registrationNumber?.trim() || null } : {}),
        ...(dto.taxNumber !== undefined ? { taxNumber: dto.taxNumber?.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: normalizePhone(dto.phone) || null } : {}),
        ...(dto.email !== undefined ? { email: normalizeEmail(dto.email) || null } : {}),
        ...(dto.contactName !== undefined ? { contactName: dto.contactName?.trim() || null } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: normalizePhone(dto.contactPhone) || null } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: normalizeEmail(dto.contactEmail) || null } : {}),
        ...(dto.billingDay !== undefined ? { billingDay: Number(dto.billingDay || 30) } : {}),
        ...(dto.creditLimit !== undefined ? { creditLimit: dto.creditLimit ? Number(dto.creditLimit) : null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    this.notificationsGateway.notify('subscription.company.updated', updated);
    return updated;
  }

  async getCompany(id: string) {
    const company = await (this.prisma as any).subscriptionCompany.findFirst({
      where: { id, deletedAt: null },
      include: {
        employees: { where: { deletedAt: null }, include: { patient: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
        charges: { where: { deletedAt: null }, include: { employee: true, patient: true, service: true }, orderBy: { serviceDate: 'desc' }, take: 100 },
        monthlyInvoices: { where: { deletedAt: null }, include: { invoice: true }, orderBy: [{ year: 'desc' }, { month: 'desc' }] },
      },
    });
    if (!company) throw new NotFoundException('Entreprise abonne introuvable.');
    return company;
  }

  async createEmployee(companyId: string, dto: any) {
    await this.getCompany(companyId);
    if (!dto?.firstName?.trim() || !dto?.lastName?.trim()) {
      throw new BadRequestException('Le nom et le prenom de l employe sont obligatoires.');
    }
    if (!dto?.policyNumber?.trim()) {
      throw new BadRequestException('Le numero de police est obligatoire.');
    }

    const created = await (this.prisma as any).subscriptionEmployee.create({
      data: {
        companyId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        middleName: dto.middleName?.trim() || null,
        gender: dto.gender || null,
        profession: dto.profession?.trim() || null,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        age: dto.age ? Number(dto.age) : null,
        phone: normalizePhone(dto.phone) || null,
        email: normalizeEmail(dto.email) || null,
        address: dto.address?.trim() || null,
        nationality: dto.nationality?.trim() || null,
        policyNumber: dto.policyNumber.trim(),
        employeeNumber: dto.employeeNumber?.trim() || null,
        status: dto.status || 'ACTIVE',
      },
      include: { company: true, patient: true },
    });
    this.notificationsGateway.notify('subscription.employee.created', created);
    return created;
  }

  async findAdmissibleEmployees(companyId?: string) {
    return (this.prisma as any).subscriptionEmployee.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        patientId: null,
        ...(companyId ? { companyId } : {}),
        company: { status: 'ACTIVE', deletedAt: null },
      },
      include: { company: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private async resolveReceptionBillingService(kind?: string) {
    const services = await this.prisma.service.findMany({
      include: { tarifs: { where: { actif: true }, orderBy: { dateDebut: 'desc' }, take: 1 } },
    });
    const isSpecialist = normalizeText(kind).includes('special');
    const service = services.find((item: any) => {
      const name = normalizeText(item.name);
      return isSpecialist
        ? name.includes('consultation specialiste') || name.includes('specialiste')
        : name.includes('consultation generale') || name.includes('generale');
    });
    if (!service) throw new BadRequestException('Configurez le tarif reception pour cette consultation.');
    const price = Number((service as any).tarifs?.[0]?.prix);
    if (!Number.isFinite(price) || price <= 0) throw new BadRequestException(`Aucun tarif actif CDF pour ${service.name}.`);
    return { service, price };
  }

  async admitEmployee(employeeId: string, dto: any, actorId?: string) {
    const employee = await (this.prisma as any).subscriptionEmployee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: { company: true, patient: true },
    });
    if (!employee) throw new NotFoundException('Employe abonne introuvable.');
    if (employee.status !== 'ACTIVE' || employee.company.status !== 'ACTIVE') {
      throw new BadRequestException('Cet employe ou son entreprise n est pas actif.');
    }
    if (employee.patientId) {
      throw new BadRequestException('Cet employe possede deja une fiche patient. Utilisez une nouvelle visite.');
    }

    const { service, price } = await this.resolveReceptionBillingService(dto.consultationKind || 'CONSULTATION_GENERALE');
    const now = new Date();
    const dateOfBirth = dto.dateOfBirth || employee.dateOfBirth;
    if (!dateOfBirth) throw new BadRequestException('La date de naissance est requise pour creer la fiche patient.');
    const gender = dto.gender || employee.gender;
    if (!gender) throw new BadRequestException('Le sexe est requis pour creer la fiche patient.');

    const result = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.create({
        data: {
          firstName: employee.firstName,
          lastName: employee.lastName,
          middleName: employee.middleName,
          gender,
          profession: employee.profession || dto.profession || null,
          dateOfBirth: new Date(dateOfBirth),
          phone: normalizePhone(dto.phone || employee.phone) || null,
          email: normalizeEmail(dto.email || employee.email) || null,
          address: dto.address || employee.address || null,
          nationality: dto.nationality || employee.nationality || null,
          insuranceProvider: employee.company.name,
          insuranceNumber: employee.policyNumber,
          workflowStatus: PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
          admissionType: 'ABONNEMENT_ENTREPRISE',
          priority: dto.priority || 'normal',
          arrivalAt: now,
          receptionistId: actorId || null,
          serviceId: dto.serviceId || null,
        } as any,
      });

      const updatedEmployee = await (tx as any).subscriptionEmployee.update({
        where: { id: employee.id },
        data: {
          patientId: patient.id,
          firstAdmissionAt: now,
          phone: normalizePhone(dto.phone || employee.phone) || null,
          email: normalizeEmail(dto.email || employee.email) || null,
          address: dto.address || employee.address || null,
          nationality: dto.nationality || employee.nationality || null,
        },
      });

      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const charge = await (tx as any).subscriptionCharge.create({
        data: {
          companyId: employee.companyId,
          employeeId: employee.id,
          patientId: patient.id,
          serviceId: service.id,
          label: `${service.name} - admission abonne`,
          amount: price,
          serviceDate: now,
          month,
          year,
        },
      });

      const history = await tx.medicalHistory.create({
        data: {
          patientId: patient.id,
          kind: 'ADMISSION_ABONNE',
          createdById: actorId || null,
          details: JSON.stringify({
            companyId: employee.companyId,
            companyName: employee.company.name,
            subscriptionEmployeeId: employee.id,
            policyNumber: employee.policyNumber,
            consultationKind: dto.consultationKind || 'CONSULTATION_GENERALE',
            monthlyChargeId: charge.id,
            amount: price,
            currency: 'CDF',
          }),
        },
      });

      return { patient, employee: updatedEmployee, charge, history };
    });

    this.notificationsGateway.notify('patient.created', result.patient);
    this.notificationsGateway.notify('patient.updated', result.patient);
    this.notificationsGateway.notify('subscription.charge.created', result.charge);
    return result;
  }

  async createCharge(dto: any) {
    if (!dto.companyId || !dto.label || !dto.amount) throw new BadRequestException('Entreprise, libelle et montant requis.');
    const serviceDate = dto.serviceDate ? new Date(dto.serviceDate) : new Date();
    const charge = await (this.prisma as any).subscriptionCharge.create({
      data: {
        companyId: dto.companyId,
        employeeId: dto.employeeId || null,
        patientId: dto.patientId || null,
        invoiceId: dto.invoiceId || null,
        serviceId: dto.serviceId || null,
        label: dto.label,
        amount: Number(dto.amount),
        serviceDate,
        month: dto.month ? Number(dto.month) : serviceDate.getMonth() + 1,
        year: dto.year ? Number(dto.year) : serviceDate.getFullYear(),
      },
    });
    this.notificationsGateway.notify('subscription.charge.created', charge);
    return charge;
  }

  async generateMonthlyInvoice(companyId: string, year: number, month: number, actorId?: string) {
    const company = await this.getCompany(companyId);
    const charges = await (this.prisma as any).subscriptionCharge.findMany({
      where: {
        companyId,
        year,
        month,
        status: 'PENDING_MONTHLY_INVOICE',
        deletedAt: null,
      },
      include: { employee: true, patient: true, service: true },
      orderBy: { serviceDate: 'asc' },
    });
    if (!charges.length) throw new BadRequestException('Aucune depense a facturer pour cette periode.');
    const total = charges.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const anchorPatient = charges.find((item: any) => item.patientId)?.patientId;
    if (!anchorPatient) throw new BadRequestException('Impossible de generer une facture sans patient rattache.');

    const dueDate = new Date(year, month, 0);
    const result = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          patientId: anchorPatient,
          issuedById: actorId || null,
          type: 'SUBSCRIPTION_MONTHLY' as any,
          status: 'ISSUED',
          issuedAt: new Date(),
          totalAmount: total,
          balanceDue: total,
          dueDate,
          remarks: `Facture mensuelle ${company.name} - ${String(month).padStart(2, '0')}/${year}`,
        },
      });

      for (const charge of charges) {
        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            serviceId: charge.serviceId || null,
            label: `${charge.employee?.firstName || charge.patient?.firstName || ''} ${charge.employee?.lastName || charge.patient?.lastName || ''} - ${charge.label}`.trim(),
            quantity: 1,
            unitPrice: charge.amount,
            totalAmount: charge.amount,
          },
        });
      }

      const monthly = await (tx as any).monthlySubscriptionInvoice.create({
        data: {
          companyId,
          invoiceId: invoice.id,
          month,
          year,
          totalAmount: total,
          status: 'ISSUED',
          dueDate,
          notes: `${charges.length} depense(s) consolidee(s).`,
        },
      });

      await (tx as any).subscriptionCharge.updateMany({
        where: { id: { in: charges.map((item: any) => item.id) } },
        data: { status: 'INVOICED', invoiceId: invoice.id },
      });

      return { invoice, monthly, charges };
    });

    this.notificationsGateway.notify('invoice.created', result.invoice);
    this.notificationsGateway.notify('subscription.monthly-invoice.created', result.monthly);
    return result;
  }
}
