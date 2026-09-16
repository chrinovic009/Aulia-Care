import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  InvoiceType,
  PatientVisitStatus,
  PatientWorkflowStatus,
  SubscriptionChargeStatus,
  SubscriptionCompanyStatus,
  SubscriptionEmployeeStatus,
} from '@prisma/client';
import { ClinicContextService } from '../core/clinic-context.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PrismaService } from '../prisma/prisma.service';

export interface SubscriptionCompanyInput {
  name?: string;
  legalName?: string;
  registrationNumber?: string;
  taxNumber?: string;
  address?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  contractNumber?: string;
  billingDay?: number | string;
  creditLimit?: number | string;
  status?: SubscriptionCompanyStatus;
  allowExistingCompany?: boolean;
}

export interface SubscriptionEmployeeInput {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  gender?: string;
  profession?: string;
  dateOfBirth?: string | Date;
  age?: number | string;
  phone?: string;
  email?: string;
  address?: string;
  nationality?: string;
  policyNumber?: string;
  employeeNumber?: string;
  status?: SubscriptionEmployeeStatus;
}

export interface ExtractedCompanyImportInput {
  company?: SubscriptionCompanyInput;
  employees?: SubscriptionEmployeeInput[];
  allowExistingCompany?: boolean;
}

export interface SubscriptionAdmissionInput {
  consultationKind?: string;
  serviceId?: string;
  dateOfBirth?: string | Date;
  gender?: string;
  profession?: string;
  phone?: string;
  email?: string;
  address?: string;
  nationality?: string;
  priority?: string;
  reason?: string;
}

export interface SubscriptionChargeInput {
  companyId?: string;
  employeeId?: string;
  patientId?: string;
  invoiceId?: string;
  serviceId?: string;
  label?: string;
  amount?: number | string;
  serviceDate?: string | Date;
  month?: number | string;
  year?: number | string;
}

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

const validBillingDay = (value: number | string | undefined) => {
  const day = Number(value ?? 30);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new BadRequestException('Le jour de facturation doit être compris entre 1 et 31.');
  }
  return day;
};

const validMoneyOrNull = (value: number | string | undefined) => {
  if (value === undefined || value === null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new BadRequestException('Le montant doit être un nombre positif ou nul.');
  }
  return amount;
};

const validDate = (value: string | Date, label: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} est invalide.`);
  return date;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private async requireClinic(actorId?: string) {
    return this.clinicContext.requireOperationalActor({ userId: actorId });
  }

  private async findCompanyInClinic(companyId: string, clinicId: string) {
    const company = await this.prisma.subscriptionCompany.findFirst({
      where: { id: companyId, clinicId, deletedAt: null },
      include: {
        employees: {
          where: { deletedAt: null },
          include: { patient: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        },
        charges: {
          where: { deletedAt: null },
          include: { employee: true, patient: true, service: true },
          orderBy: { serviceDate: 'desc' },
          take: 100,
        },
        monthlyInvoices: {
          where: { deletedAt: null },
          include: { invoice: true },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        },
      },
    });
    if (!company) throw new NotFoundException('Entreprise abonnée introuvable dans cet établissement.');
    return company;
  }

  async findCompanies(actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.prisma.subscriptionCompany.findMany({
      where: { clinicId: actor.clinicId, deletedAt: null },
      include: {
        employees: { where: { deletedAt: null }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
        monthlyInvoices: { where: { deletedAt: null }, orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 6 },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCompany(dto: SubscriptionCompanyInput, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    if (!dto?.name?.trim()) throw new BadRequestException('Le nom de l’entreprise est obligatoire.');
    const contractNumber = dto.contractNumber?.trim() || `SUB-${Date.now()}`;
    const existingContract = await this.prisma.subscriptionCompany.findFirst({
      where: { contractNumber, deletedAt: null },
      select: { id: true, clinicId: true },
    });
    if (existingContract) {
      throw new BadRequestException(existingContract.clinicId === actor.clinicId
        ? 'Cette entreprise existe déjà dans cet établissement.'
        : 'Ce numéro de contrat est déjà utilisé.');
    }
    const created = await this.prisma.subscriptionCompany.create({
      data: {
        clinicId: actor.clinicId,
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
        contractNumber,
        billingDay: validBillingDay(dto.billingDay),
        creditLimit: validMoneyOrNull(dto.creditLimit),
        status: dto.status || SubscriptionCompanyStatus.ACTIVE,
      },
    });
    this.notificationsGateway.notify('subscription.company.created', created);
    return created;
  }

  /** Document-analysis data is reviewed by the browser; persistence is tenant-scoped server-side. */
  async importExtractedCompany(payload: ExtractedCompanyImportInput, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const company = payload?.company;
    const employees = Array.isArray(payload?.employees) ? payload.employees : [];
    const contractNumber = String(company?.contractNumber || '').trim();
    if (!company?.name?.trim() || !contractNumber) {
      throw new BadRequestException('Le nom de l’entreprise et le numéro de contrat sont obligatoires.');
    }
    if (!employees.length) throw new BadRequestException('Le document ne contient aucun employé exploitable.');
    const normalizedEmployees = employees.map((employee, index) => {
      const firstName = String(employee.firstName || '').trim();
      const lastName = String(employee.lastName || '').trim();
      const policyNumber = String(employee.policyNumber || '').trim();
      if (!firstName || !lastName || !policyNumber) {
        throw new BadRequestException(`Employé ${index + 1}: nom, prénom et numéro de police sont requis.`);
      }
      const age = employee.age === undefined || employee.age === '' ? null : Number(employee.age);
      if (age !== null && (!Number.isInteger(age) || age < 0)) throw new BadRequestException('Un âge d’employé est invalide.');
      return {
        firstName, lastName, policyNumber, age,
        middleName: String(employee.middleName || '').trim() || null,
        gender: employee.gender || null,
        profession: String(employee.profession || '').trim() || null,
        dateOfBirth: employee.dateOfBirth ? validDate(employee.dateOfBirth, 'La date de naissance') : null,
        phone: normalizePhone(employee.phone) || null,
        email: normalizeEmail(employee.email) || null,
        address: String(employee.address || '').trim() || null,
        nationality: String(employee.nationality || '').trim() || null,
        employeeNumber: String(employee.employeeNumber || '').trim() || null,
      };
    });
    if (new Set(normalizedEmployees.map((employee) => employee.policyNumber)).size !== normalizedEmployees.length) {
      throw new BadRequestException('Le document contient des numéros de police en double.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscriptionCompany.findFirst({
        where: { contractNumber, clinicId: actor.clinicId, deletedAt: null },
      });
      const foreignContract = !existing ? await tx.subscriptionCompany.findFirst({
        where: { contractNumber, deletedAt: null }, select: { id: true },
      }) : null;
      if (foreignContract) throw new BadRequestException('Ce numéro de contrat est déjà utilisé.');
      if (existing && !payload.allowExistingCompany) {
        throw new BadRequestException('Cette entreprise existe déjà. Confirmez explicitement la mise à jour avant un nouvel import.');
      }
      const companyData = {
        name: company.name.trim(), legalName: company.legalName?.trim() || company.name.trim(),
        registrationNumber: company.registrationNumber?.trim() || null, taxNumber: company.taxNumber?.trim() || null,
        address: company.address?.trim() || null, phone: normalizePhone(company.phone) || null,
        email: normalizeEmail(company.email) || null, contactName: company.contactName?.trim() || null,
        contactPhone: normalizePhone(company.contactPhone) || null, contactEmail: normalizeEmail(company.contactEmail) || null,
        billingDay: validBillingDay(company.billingDay), creditLimit: validMoneyOrNull(company.creditLimit),
        status: company.status || SubscriptionCompanyStatus.ACTIVE,
      };
      const savedCompany = existing
        ? await tx.subscriptionCompany.update({ where: { id: existing.id }, data: companyData })
        : await tx.subscriptionCompany.create({ data: { ...companyData, clinicId: actor.clinicId, contractNumber } });
      const importResult = await tx.subscriptionEmployee.createMany({
        data: normalizedEmployees.map((employee) => ({ ...employee, companyId: savedCompany.id, status: SubscriptionEmployeeStatus.ACTIVE })),
        skipDuplicates: true,
      });
      await tx.auditTrail.create({
        data: {
          actorId: actor.id, entity: 'SubscriptionCompany', entityId: savedCompany.id, action: AuditAction.CREATE,
          after: { source: 'DOCUMENT_AI_REVIEWED', clinicId: actor.clinicId, employeeCount: importResult.count },
        },
      });
      return { company: savedCompany, employeesCreated: importResult.count, employeesIgnored: normalizedEmployees.length - importResult.count };
    });
    this.notificationsGateway.notify('subscription.company.imported', result);
    return result;
  }

  async updateCompany(id: string, dto: SubscriptionCompanyInput, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    await this.findCompanyInClinic(id, actor.clinicId);
    const updated = await this.prisma.subscriptionCompany.update({
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
        ...(dto.billingDay !== undefined ? { billingDay: validBillingDay(dto.billingDay) } : {}),
        ...(dto.creditLimit !== undefined ? { creditLimit: validMoneyOrNull(dto.creditLimit) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    this.notificationsGateway.notify('subscription.company.updated', updated);
    return updated;
  }

  async getCompany(id: string, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    return this.findCompanyInClinic(id, actor.clinicId);
  }

  async createEmployee(companyId: string, dto: SubscriptionEmployeeInput, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    await this.findCompanyInClinic(companyId, actor.clinicId);
    if (!dto?.firstName?.trim() || !dto?.lastName?.trim()) throw new BadRequestException('Le nom et le prénom de l’employé sont obligatoires.');
    if (!dto.policyNumber?.trim()) throw new BadRequestException('Le numéro de police est obligatoire.');
    const age = dto.age === undefined || dto.age === '' ? null : Number(dto.age);
    if (age !== null && (!Number.isInteger(age) || age < 0)) throw new BadRequestException('L’âge est invalide.');
    const created = await this.prisma.subscriptionEmployee.create({
      data: {
        companyId, firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), middleName: dto.middleName?.trim() || null,
        gender: dto.gender || null, profession: dto.profession?.trim() || null,
        dateOfBirth: dto.dateOfBirth ? validDate(dto.dateOfBirth, 'La date de naissance') : null, age,
        phone: normalizePhone(dto.phone) || null, email: normalizeEmail(dto.email) || null,
        address: dto.address?.trim() || null, nationality: dto.nationality?.trim() || null,
        policyNumber: dto.policyNumber.trim(), employeeNumber: dto.employeeNumber?.trim() || null,
        status: dto.status || SubscriptionEmployeeStatus.ACTIVE,
      }, include: { company: true, patient: true },
    });
    this.notificationsGateway.notify('subscription.employee.created', created);
    return created;
  }

  async findAdmissibleEmployees(companyId: string | undefined, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    if (companyId) await this.findCompanyInClinic(companyId, actor.clinicId);
    return this.prisma.subscriptionEmployee.findMany({
      where: {
        deletedAt: null, status: SubscriptionEmployeeStatus.ACTIVE, patientId: null,
        ...(companyId ? { companyId } : {}),
        company: { clinicId: actor.clinicId, status: SubscriptionCompanyStatus.ACTIVE, deletedAt: null },
      }, include: { company: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private async resolveReceptionBillingService(kind: string | undefined, clinicId: string) {
    const expectedName = normalizeText(kind).includes('special')
      ? 'consultation specialiste - reception' : 'consultation generale - reception';
    // Existing institutions commonly use French accents in the labels shown
    // to reception. Prisma's case-insensitive equality does not normalize
    // accents, so keep a bounded set of the official French spellings rather
    // than loading an establishment's whole service catalogue.
    const labels = expectedName === 'consultation specialiste - reception'
      ? [
          'consultation specialiste - reception',
          'consultation spécialiste - réception',
        ]
      : [
          'consultation generale - reception',
          'consultation générale - réception',
        ];
    const service = await this.prisma.service.findFirst({
      where: {
        clinicId,
        active: true,
        OR: labels.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })),
      },
      include: { tarifs: { where: { actif: true }, orderBy: { dateDebut: 'desc' }, take: 1 } },
    });
    if (!service) throw new BadRequestException('Configurez le tarif réception pour cette consultation.');
    const price = Number(service.tarifs[0]?.prix);
    if (!Number.isFinite(price) || price <= 0) throw new BadRequestException(`Aucun tarif actif CDF pour ${service.name}.`);
    return { service, price };
  }

  async admitEmployee(employeeId: string, dto: SubscriptionAdmissionInput, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    const employee = await this.prisma.subscriptionEmployee.findFirst({
      where: { id: employeeId, deletedAt: null, company: { clinicId: actor.clinicId, deletedAt: null } },
      include: { company: true, patient: true },
    });
    if (!employee) throw new NotFoundException('Employé abonné introuvable dans cet établissement.');
    if (employee.status !== SubscriptionEmployeeStatus.ACTIVE || employee.company.status !== SubscriptionCompanyStatus.ACTIVE) {
      throw new BadRequestException('Cet employé ou son entreprise n’est pas actif.');
    }
    if (employee.patientId) throw new BadRequestException('Cet employé possède déjà une fiche patient. Utilisez une nouvelle visite.');
    const { service: billingService, price } = await this.resolveReceptionBillingService(dto.consultationKind || 'CONSULTATION_GENERALE', actor.clinicId);
    const selectedService = dto.serviceId
      ? await this.prisma.service.findFirst({ where: { id: dto.serviceId, clinicId: actor.clinicId, active: true }, select: { id: true } })
      : billingService;
    if (!selectedService) throw new NotFoundException('Le service choisi est introuvable dans cet établissement.');
    const now = new Date();
    const dateOfBirth = dto.dateOfBirth || employee.dateOfBirth;
    if (!dateOfBirth) throw new BadRequestException('La date de naissance est requise pour créer la fiche patient.');
    const gender = dto.gender || employee.gender;
    if (!gender) throw new BadRequestException('Le sexe est requis pour créer la fiche patient.');

    const result = await this.prisma.$transaction(async (tx) => {
      const currentEmployee = await tx.subscriptionEmployee.findFirst({
        where: {
          id: employee.id, patientId: null, deletedAt: null, status: SubscriptionEmployeeStatus.ACTIVE,
          company: { clinicId: actor.clinicId, status: SubscriptionCompanyStatus.ACTIVE, deletedAt: null },
        }, include: { company: true },
      });
      if (!currentEmployee) throw new BadRequestException('Cet employé a déjà été admis ou n’est plus disponible.');
      const patient = await tx.patient.create({
        data: {
          clinicId: actor.clinicId, firstName: currentEmployee.firstName, lastName: currentEmployee.lastName,
          middleName: currentEmployee.middleName, gender, profession: currentEmployee.profession || dto.profession?.trim() || null,
          dateOfBirth: validDate(dateOfBirth, 'La date de naissance'), phone: normalizePhone(dto.phone || currentEmployee.phone) || null,
          email: normalizeEmail(dto.email || currentEmployee.email) || null, address: dto.address?.trim() || currentEmployee.address || null,
          nationality: dto.nationality?.trim() || currentEmployee.nationality || null, insuranceProvider: currentEmployee.company.name,
          insuranceNumber: currentEmployee.policyNumber, workflowStatus: PatientWorkflowStatus.EN_ATTENTE_INFIRMERIE,
          admissionType: 'ABONNEMENT_ENTREPRISE', priority: dto.priority || 'normal', arrivalAt: now,
          receptionistId: actor.id, serviceId: selectedService.id,
        },
      });
      const claim = await tx.subscriptionEmployee.updateMany({
        where: { id: currentEmployee.id, patientId: null, companyId: currentEmployee.companyId },
        data: { patientId: patient.id, firstAdmissionAt: now, phone: normalizePhone(dto.phone || currentEmployee.phone) || null,
          email: normalizeEmail(dto.email || currentEmployee.email) || null, address: dto.address?.trim() || currentEmployee.address || null,
          nationality: dto.nationality?.trim() || currentEmployee.nationality || null },
      });
      if (claim.count !== 1) throw new BadRequestException('L’admission concurrente de cet employé a été refusée. Réessayez.');
      const visit = await tx.patientVisit.create({
        data: {
          patientId: patient.id, receptionistId: actor.id, clinicId: actor.clinicId, serviceId: selectedService.id,
          visitType: 'ABONNEMENT_ENTREPRISE', reason: dto.reason?.trim() || `Admission abonnement entreprise — ${currentEmployee.company.name}`,
          status: PatientVisitStatus.ORIENTED, arrivedAt: now, orientedAt: now,
          metadata: { subscriptionCompanyId: currentEmployee.companyId, subscriptionEmployeeId: currentEmployee.id,
            policyNumber: currentEmployee.policyNumber, consultationKind: dto.consultationKind || 'CONSULTATION_GENERALE' },
        },
      });
      const charge = await tx.subscriptionCharge.create({
        data: { companyId: currentEmployee.companyId, employeeId: currentEmployee.id, patientId: patient.id, serviceId: billingService.id,
          label: `${billingService.name} - admission abonné`, amount: price, serviceDate: now, month: now.getMonth() + 1, year: now.getFullYear() },
      });
      const history = await tx.medicalHistory.create({
        data: { patientId: patient.id, kind: 'ADMISSION_ABONNE', createdById: actor.id,
          details: JSON.stringify({ clinicId: actor.clinicId, companyId: currentEmployee.companyId, companyName: currentEmployee.company.name,
            subscriptionEmployeeId: currentEmployee.id, policyNumber: currentEmployee.policyNumber, patientVisitId: visit.id,
            consultationKind: dto.consultationKind || 'CONSULTATION_GENERALE', monthlyChargeId: charge.id, amount: price, currency: 'CDF' }) },
      });
      await tx.auditTrail.create({
        data: { actorId: actor.id, entity: 'SubscriptionAdmission', entityId: visit.id, action: AuditAction.CREATE,
          after: { clinicId: actor.clinicId, patientId: patient.id, patientVisitId: visit.id, subscriptionChargeId: charge.id } },
      });
      return { patient, visit, charge, history };
    });
    this.notificationsGateway.notify('patient.created', result.patient);
    this.notificationsGateway.notify('patient.updated', result.patient);
    this.notificationsGateway.notify('subscription.charge.created', result.charge);
    return result;
  }

  async createCharge(dto: SubscriptionChargeInput, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    if (!dto.companyId || !dto.label?.trim() || dto.amount === undefined) throw new BadRequestException('Entreprise, libellé et montant sont requis.');
    const company = await this.findCompanyInClinic(dto.companyId, actor.clinicId);
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Le montant doit être supérieur à zéro.');
    const serviceDate = dto.serviceDate ? validDate(dto.serviceDate, 'La date de service') : new Date();
    if (dto.employeeId) {
      const employee = await this.prisma.subscriptionEmployee.findFirst({ where: { id: dto.employeeId, companyId: company.id, deletedAt: null }, select: { id: true } });
      if (!employee) throw new NotFoundException('Employé abonné introuvable dans cette entreprise.');
    }
    if (dto.patientId) {
      const patient = await this.prisma.patient.findFirst({ where: { id: dto.patientId, clinicId: actor.clinicId, deletedAt: null }, select: { id: true } });
      if (!patient) throw new NotFoundException('Patient introuvable dans cet établissement.');
    }
    if (dto.serviceId) {
      const service = await this.prisma.service.findFirst({ where: { id: dto.serviceId, clinicId: actor.clinicId, active: true }, select: { id: true } });
      if (!service) throw new NotFoundException('Service introuvable dans cet établissement.');
    }
    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, clinicId: actor.clinicId, deletedAt: null }, select: { id: true } });
      if (!invoice) throw new NotFoundException('Facture introuvable dans cet établissement.');
    }
    const charge = await this.prisma.subscriptionCharge.create({
      data: { companyId: company.id, employeeId: dto.employeeId || null, patientId: dto.patientId || null, invoiceId: dto.invoiceId || null,
        serviceId: dto.serviceId || null, label: dto.label.trim(), amount, serviceDate,
        month: dto.month ? Number(dto.month) : serviceDate.getMonth() + 1, year: dto.year ? Number(dto.year) : serviceDate.getFullYear() },
    });
    this.notificationsGateway.notify('subscription.charge.created', charge);
    return charge;
  }

  async generateMonthlyInvoice(companyId: string, year: number, month: number, actorId?: string) {
    const actor = await this.requireClinic(actorId);
    if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 1 || month > 12) throw new BadRequestException('La période de facturation est invalide.');
    const company = await this.findCompanyInClinic(companyId, actor.clinicId);
    const charges = await this.prisma.subscriptionCharge.findMany({
      where: { companyId: company.id, year, month, status: SubscriptionChargeStatus.PENDING_MONTHLY_INVOICE, deletedAt: null,
        company: { clinicId: actor.clinicId, deletedAt: null } },
      include: { employee: true, patient: true, service: true }, orderBy: { serviceDate: 'asc' },
    });
    if (!charges.length) throw new BadRequestException('Aucune dépense à facturer pour cette période.');
    if (charges.some((charge) => charge.patient?.clinicId !== actor.clinicId)) throw new ForbiddenException('Une dépense abonnement est incohérente avec cet établissement.');
    const total = charges.reduce((sum, item) => sum + Number(item.amount), 0);
    const anchorPatient = charges.find((item) => item.patientId)?.patientId;
    if (!anchorPatient) throw new BadRequestException('Impossible de générer une facture sans patient rattaché.');
    const dueDate = new Date(year, month, 0);
    const result = await this.prisma.$transaction(async (tx) => {
      const existingMonthly = await tx.monthlySubscriptionInvoice.findFirst({ where: { companyId: company.id, year, month, deletedAt: null }, select: { id: true } });
      if (existingMonthly) throw new BadRequestException('La facture mensuelle de cette période existe déjà.');
      const invoice = await tx.invoice.create({
        data: { patientId: anchorPatient, issuedById: actor.id, clinicId: actor.clinicId, type: InvoiceType.SUBSCRIPTION_MONTHLY,
          status: 'ISSUED', issuedAt: new Date(), totalAmount: total, balanceDue: total, dueDate,
          remarks: `Facture mensuelle ${company.name} - ${String(month).padStart(2, '0')}/${year}` },
      });
      await tx.invoiceLine.createMany({ data: charges.map((charge) => ({ invoiceId: invoice.id, serviceId: charge.serviceId || null,
        label: `${charge.employee?.firstName || charge.patient?.firstName || ''} ${charge.employee?.lastName || charge.patient?.lastName || ''} - ${charge.label}`.trim(),
        quantity: 1, unitPrice: charge.amount, totalAmount: charge.amount })) });
      const monthly = await tx.monthlySubscriptionInvoice.create({
        data: { companyId: company.id, invoiceId: invoice.id, month, year, totalAmount: total, status: 'ISSUED', dueDate,
          notes: `${charges.length} dépense(s) consolidée(s).` },
      });
      const updatedCharges = await tx.subscriptionCharge.updateMany({
        where: { id: { in: charges.map((charge) => charge.id) }, companyId: company.id, status: SubscriptionChargeStatus.PENDING_MONTHLY_INVOICE },
        data: { status: SubscriptionChargeStatus.INVOICED, invoiceId: invoice.id },
      });
      if (updatedCharges.count !== charges.length) throw new BadRequestException('La période a changé pendant la génération. Réessayez.');
      await tx.auditTrail.create({
        data: { actorId: actor.id, entity: 'MonthlySubscriptionInvoice', entityId: monthly.id, action: AuditAction.CREATE,
          after: { clinicId: actor.clinicId, companyId: company.id, invoiceId: invoice.id, month, year } },
      });
      return { invoice, monthly, charges };
    });
    this.notificationsGateway.notify('invoice.created', result.invoice);
    this.notificationsGateway.notify('subscription.monthly-invoice.created', result.monthly);
    return result;
  }
}
