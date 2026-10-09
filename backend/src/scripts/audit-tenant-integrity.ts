import 'dotenv/config';
import { PrismaClient, RoleSlug, ServiceCategory } from '@prisma/client';
import { categoryForDepartmentType } from '../services/service-category.policy';

/**
 * Tenant integrity maintenance tool.
 *
 * Default mode is read-only. `--apply` repairs only deterministic legacy
 * mismatches: an Employee missing clinicId while its linked User has one, or
 * a User missing clinicId while exactly one linked Employee has one. It never
 * guesses a clinic for a fully detached account and never overwrites a
 * conflicting clinic id.
 */
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const operationalRoles = Object.values(RoleSlug).filter((role) => role !== RoleSlug.DEV);

type Finding = { category: string; id: string; detail: Record<string, unknown>; repairable?: boolean };
const findings: Finding[] = [];
const report = (category: string, id: string, detail: Record<string, unknown>, repairable = false) => {
  findings.push({ category, id, detail, repairable });
};

async function audit() {
  const [users, employees, serviceUnits, services, roomAssignments, configurations, subscriptionCompanies, operatingRooms, imagingCatalogues, imagingMachines, wearablePlans, wearableLots, legacyExpenses, legacyRevenues] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, primaryRole: { in: operationalRoles } },
      select: {
        id: true,
        username: true,
        primaryRole: true,
        clinicId: true,
        Employee: { select: { id: true, clinicId: true } },
        patientPortalProfile: { select: { clinicId: true } },
      },
    }),
    prisma.employee.findMany({
      select: { id: true, userId: true, clinicId: true, user: { select: { id: true, clinicId: true, primaryRole: true } } },
    }),
    prisma.serviceUnit.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        clinicId: true,
        category: true,
        department: { select: { clinicId: true, type: true } },
      },
    }),
    prisma.service.findMany({
      where: { active: true },
      select: { id: true, name: true, clinicId: true, category: true },
    }),
    prisma.roomStaffAssignment.findMany({
      where: { active: true },
      select: { id: true, user: { select: { clinicId: true } }, room: { select: { serviceUnit: { select: { clinicId: true } } } } },
    }),
    prisma.platformLayerConfiguration.findMany({ select: { id: true, clinicId: true } }),
    prisma.subscriptionCompany.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        clinicId: true,
        employees: { where: { deletedAt: null }, select: { id: true, patient: { select: { clinicId: true } } } },
        monthlyInvoices: { where: { deletedAt: null }, select: { id: true, invoice: { select: { clinicId: true } } } },
      },
    }),
    prisma.operatingRoom.findMany({
      where: { deletedAt: null },
      select: { id: true, clinicId: true, surgeries: { where: { deletedAt: null }, select: { id: true, patient: { select: { clinicId: true } } } } },
    }),
    prisma.imagingCatalogue.findMany({
      where: { deletedAt: null },
      select: { id: true, clinicId: true, imagingRequests: { where: { deletedAt: null }, select: { id: true, patient: { select: { clinicId: true } } } } },
    }),
    prisma.imagingMachine.findMany({
      where: { deletedAt: null },
      select: { id: true, clinicId: true, imagingRequests: { where: { deletedAt: null }, select: { id: true, patient: { select: { clinicId: true } } } } },
    }),
    prisma.wearablePlan.findMany({
      select: { id: true, clinicId: true, lots: { select: { id: true, clinicId: true } }, subscriptions: { select: { id: true, patient: { select: { clinicId: true } } } } },
    }),
    prisma.wearableLot.findMany({
      select: { id: true, clinicId: true, plan: { select: { clinicId: true } }, devices: { select: { id: true, wearableDevice: { select: { patient: { select: { clinicId: true } } } } } } },
    }),
    // These two legacy financial tables predate clinic ownership. They are
    // intentionally excluded by BillingService and explicitly reported here
    // until a dedicated, human-approved migration gives each row a tenant.
    prisma.expense.findMany({ where: { deletedAt: null }, select: { id: true } }),
    prisma.revenue.findMany({ select: { id: true } }),
  ]);

  // These are the records that form the patient workflow.  They must remain
  // tenant-aligned even when a legacy database predates the NOT NULL migration.
  const [patients, patientVisits, appointments, consultations, prescriptions, labRequests, imagingRequests, hospitalizations, invoices, payments, pharmacies, medicationStocks, stockMovements, purchaseOrders, goodsReceipts, supplierInvoices, supplierPayments, stockLots, stockTransactions, pharmacyDispenses, notifications, chatMessages, auditLogs, parentChildLinks, telehealthSessions] = await Promise.all([
    prisma.patient.findMany({
      where: { deletedAt: null },
      select: { id: true, clinicId: true, receptionist: { select: { clinicId: true } } },
    }),
    prisma.patientVisit.findMany({
      select: {
        id: true, clinicId: true,
        patient: { select: { clinicId: true } },
        appointment: { select: { clinicId: true } },
        invoice: { select: { clinicId: true } },
        service: { select: { clinicId: true } },
        receptionist: { select: { clinicId: true } },
      },
    }),
    prisma.appointment.findMany({
      where: { deletedAt: null },
      select: {
        id: true, clinicId: true,
        patient: { select: { clinicId: true } },
        serviceUnit: { select: { clinicId: true } },
        requestedBy: { select: { clinicId: true } },
      },
    }),
    prisma.consultation.findMany({
      where: { deletedAt: null },
      select: {
        id: true, clinicId: true,
        patient: { select: { clinicId: true } },
        appointment: { select: { clinicId: true } },
        provider: { select: { clinicId: true } },
        hospitalization: { select: { clinicId: true } },
      },
    }),
    prisma.prescription.findMany({
      where: { deletedAt: null },
      select: {
        id: true, clinicId: true,
        patient: { select: { clinicId: true } },
        consultation: { select: { clinicId: true } },
        prescriber: { select: { clinicId: true } },
      },
    }),
    prisma.labRequest.findMany({
      where: { deletedAt: null },
      select: {
        id: true, clinicId: true,
        patient: { select: { clinicId: true } },
        consultation: { select: { clinicId: true } },
        requestedBy: { select: { clinicId: true } },
      },
    }),
    prisma.imagingRequest.findMany({
      where: { deletedAt: null },
      select: {
        id: true, clinicId: true,
        patient: { select: { clinicId: true } },
        consultation: { select: { clinicId: true } },
        imagingCatalogue: { select: { clinicId: true } },
        machine: { select: { clinicId: true } },
        requestedBy: { select: { clinicId: true } },
        technician: { select: { clinicId: true } },
      },
    }),
    prisma.hospitalization.findMany({
      where: { deletedAt: null },
      select: {
        id: true, clinicId: true,
        patient: { select: { clinicId: true } },
        ServiceUnit: { select: { clinicId: true } },
        physician: { select: { clinicId: true } },
        nurseInCharge: { select: { clinicId: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null },
      select: {
        id: true, clinicId: true,
        patient: { select: { clinicId: true } },
        issuedBy: { select: { clinicId: true } },
      },
    }),
    prisma.payment.findMany({
      where: { deletedAt: null },
      select: {
        id: true, clinicId: true,
        invoice: { select: { clinicId: true } },
        paidBy: { select: { clinicId: true } },
      },
    }),
    prisma.pharmacy.findMany({
      select: { id: true, clinicId: true },
    }),
    prisma.medicationStock.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        clinicId: true,
        Pharmacy: { select: { clinicId: true } },
      },
    }),
    prisma.stockMovement.findMany({
      select: { id: true, clinicId: true, supplierId: true, performedById: true },
    }),
    prisma.purchaseOrder.findMany({
      select: {
        id: true,
        clinicId: true,
        supplier: { select: { clinicId: true } },
      },
    }),
    prisma.goodsReceipt.findMany({
      select: {
        id: true,
        clinicId: true,
        purchaseOrder: { select: { clinicId: true } },
        supplier: { select: { clinicId: true } },
        receivedBy: { select: { clinicId: true } },
      },
    }),
    prisma.supplierInvoice.findMany({
      select: {
        id: true,
        clinicId: true,
        supplier: { select: { clinicId: true } },
        purchaseOrder: { select: { clinicId: true } },
      },
    }),
    prisma.supplierPayment.findMany({
      select: {
        id: true,
        clinicId: true,
        supplier: { select: { clinicId: true } },
        supplierInvoice: { select: { clinicId: true } },
      },
    }),
    prisma.stockLot.findMany({
      select: { id: true, clinicId: true },
    }),
    prisma.stockTransaction.findMany({
      select: {
        id: true,
        clinicId: true,
        lot: { select: { clinicId: true } },
        performedBy: { select: { clinicId: true } },
      },
    }),
    prisma.pharmacyDispense.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        clinicId: true,
        prescription: { select: { clinicId: true } },
        dispensedBy: { select: { clinicId: true } },
      },
    }),
    prisma.notification.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        recipient: { select: { clinicId: true } },
        author: { select: { clinicId: true } },
        patient: { select: { clinicId: true } },
      },
    }),
    prisma.chatMessage.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        clinicId: true,
        sender: { select: { clinicId: true } },
        recipient: { select: { clinicId: true } },
      },
    }),
    prisma.auditLog.findMany({
      select: {
        id: true,
        actor: { select: { clinicId: true } },
        patient: { select: { clinicId: true } },
      },
    }),
    prisma.parentChildLink.findMany({
      select: {
        id: true,
        parent: { select: { clinicId: true } },
        child: { select: { clinicId: true } },
      },
    }),
    prisma.telehealthSession.findMany({
      select: {
        id: true,
        consultation: { select: { clinicId: true } },
        patient: { select: { clinicId: true } },
        doctor: { select: { clinicId: true } },
        patientUser: { select: { clinicId: true } },
      },
    }),
  ]);

  const sameClinic = (childClinicId: string | null, parentClinicId: string | null) =>
    Boolean(childClinicId) && childClinicId === parentClinicId;
  const reportClinicalMismatch = (
    category: string,
    id: string,
    clinicId: string | null,
    related: Record<string, string | null>,
  ) => {
    if (!clinicId) {
      report(`${category}_WITHOUT_CLINIC`, id, related);
      return;
    }
    const mismatched = Object.entries(related).filter(([, relatedClinicId]) =>
      relatedClinicId !== null && !sameClinic(clinicId, relatedClinicId),
    );
    if (mismatched.length) {
      report(`${category}_CROSS_CLINIC`, id, {
        clinicId,
        ...related,
        mismatchedRelations: mismatched.map(([relation]) => relation),
      });
    }
  };

  for (const patient of patients) {
    reportClinicalMismatch('PATIENT', patient.id, patient.clinicId, {
      receptionistClinicId: patient.receptionist?.clinicId ?? null,
    });
  }
  for (const visit of patientVisits) {
    reportClinicalMismatch('PATIENT_VISIT', visit.id, visit.clinicId, {
      patientClinicId: visit.patient.clinicId,
      appointmentClinicId: visit.appointment?.clinicId ?? null,
      invoiceClinicId: visit.invoice?.clinicId ?? null,
      serviceClinicId: visit.service?.clinicId ?? null,
      receptionistClinicId: visit.receptionist?.clinicId ?? null,
    });
  }
  for (const appointment of appointments) {
    reportClinicalMismatch('APPOINTMENT', appointment.id, appointment.clinicId, {
      patientClinicId: appointment.patient.clinicId,
      serviceUnitClinicId: appointment.serviceUnit?.clinicId ?? null,
      requestedByClinicId: appointment.requestedBy?.clinicId ?? null,
    });
  }
  for (const consultation of consultations) {
    reportClinicalMismatch('CONSULTATION', consultation.id, consultation.clinicId, {
      patientClinicId: consultation.patient.clinicId,
      appointmentClinicId: consultation.appointment.clinicId,
      providerClinicId: consultation.provider?.clinicId ?? null,
      hospitalizationClinicId: consultation.hospitalization?.clinicId ?? null,
    });
  }
  for (const prescription of prescriptions) {
    reportClinicalMismatch('PRESCRIPTION', prescription.id, prescription.clinicId, {
      patientClinicId: prescription.patient.clinicId,
      consultationClinicId: prescription.consultation.clinicId,
      prescriberClinicId: prescription.prescriber?.clinicId ?? null,
    });
  }
  for (const labRequest of labRequests) {
    reportClinicalMismatch('LAB_REQUEST', labRequest.id, labRequest.clinicId, {
      patientClinicId: labRequest.patient.clinicId,
      consultationClinicId: labRequest.consultation.clinicId,
      requestedByClinicId: labRequest.requestedBy?.clinicId ?? null,
    });
  }
  for (const imagingRequest of imagingRequests) {
    reportClinicalMismatch('IMAGING_REQUEST', imagingRequest.id, imagingRequest.clinicId, {
      patientClinicId: imagingRequest.patient.clinicId,
      consultationClinicId: imagingRequest.consultation.clinicId,
      catalogueClinicId: imagingRequest.imagingCatalogue?.clinicId ?? null,
      machineClinicId: imagingRequest.machine?.clinicId ?? null,
      requestedByClinicId: imagingRequest.requestedBy?.clinicId ?? null,
      technicianClinicId: imagingRequest.technician?.clinicId ?? null,
    });
  }
  for (const hospitalization of hospitalizations) {
    reportClinicalMismatch('HOSPITALIZATION', hospitalization.id, hospitalization.clinicId, {
      patientClinicId: hospitalization.patient.clinicId,
      serviceUnitClinicId: hospitalization.ServiceUnit?.clinicId ?? null,
      physicianClinicId: hospitalization.physician?.clinicId ?? null,
      nurseClinicId: hospitalization.nurseInCharge?.clinicId ?? null,
    });
  }
  for (const invoice of invoices) {
    reportClinicalMismatch('INVOICE', invoice.id, invoice.clinicId, {
      patientClinicId: invoice.patient.clinicId,
      issuedByClinicId: invoice.issuedBy?.clinicId ?? null,
    });
  }
  for (const payment of payments) {
    reportClinicalMismatch('PAYMENT', payment.id, payment.clinicId, {
      invoiceClinicId: payment.invoice.clinicId,
      paidByClinicId: payment.paidBy?.clinicId ?? null,
    });
  }
  for (const pharmacy of pharmacies) {
    if (!pharmacy.clinicId) {
      report('PHARMACY_WITHOUT_CLINIC', pharmacy.id, {});
    }
  }
  for (const stock of medicationStocks) {
    reportClinicalMismatch('MEDICATION_STOCK', stock.id, stock.clinicId, {
      pharmacyClinicId: stock.Pharmacy?.clinicId ?? null,
    });
  }
  for (const order of purchaseOrders) {
    reportClinicalMismatch('PURCHASE_ORDER', order.id, order.clinicId, {
      supplierClinicId: order.supplier.clinicId,
    });
  }
  for (const receipt of goodsReceipts) {
    reportClinicalMismatch('GOODS_RECEIPT', receipt.id, receipt.clinicId, {
      purchaseOrderClinicId: receipt.purchaseOrder?.clinicId ?? null,
      supplierClinicId: receipt.supplier?.clinicId ?? null,
      receivedByClinicId: receipt.receivedBy?.clinicId ?? null,
    });
  }
  for (const invoice of supplierInvoices) {
    reportClinicalMismatch('SUPPLIER_INVOICE', invoice.id, invoice.clinicId, {
      supplierClinicId: invoice.supplier.clinicId,
      purchaseOrderClinicId: invoice.purchaseOrder?.clinicId ?? null,
    });
  }
  for (const payment of supplierPayments) {
    reportClinicalMismatch('SUPPLIER_PAYMENT', payment.id, payment.clinicId, {
      supplierClinicId: payment.supplier.clinicId,
      supplierInvoiceClinicId: payment.supplierInvoice?.clinicId ?? null,
    });
  }
  for (const lot of stockLots) {
    if (!lot.clinicId) report('STOCK_LOT_WITHOUT_CLINIC', lot.id, {});
  }
  for (const transaction of stockTransactions) {
    reportClinicalMismatch('STOCK_TRANSACTION', transaction.id, transaction.clinicId, {
      stockLotClinicId: transaction.lot?.clinicId ?? null,
      performedByClinicId: transaction.performedBy?.clinicId ?? null,
    });
  }
  for (const dispense of pharmacyDispenses) {
    reportClinicalMismatch('PHARMACY_DISPENSE', dispense.id, dispense.clinicId, {
      prescriptionClinicId: dispense.prescription.clinicId,
      dispensedByClinicId: dispense.dispensedBy?.clinicId ?? null,
    });
  }
  for (const notification of notifications) {
    const relatedClinics = {
      recipientClinicId: notification.recipient?.clinicId ?? null,
      authorClinicId: notification.author?.clinicId ?? null,
      patientClinicId: notification.patient?.clinicId ?? null,
    };
    const clinicIds = [...new Set(Object.values(relatedClinics).filter((clinicId): clinicId is string => Boolean(clinicId)))];
    if (clinicIds.length === 0) {
      report('NOTIFICATION_WITHOUT_TENANT_OWNER', notification.id, relatedClinics);
    } else if (clinicIds.length > 1) {
      report('NOTIFICATION_CROSS_CLINIC', notification.id, relatedClinics);
    }
  }
  for (const message of chatMessages) {
    reportClinicalMismatch('CHAT_MESSAGE', message.id, message.clinicId, {
      senderClinicId: message.sender.clinicId,
      recipientClinicId: message.recipient.clinicId,
    });
  }
  for (const log of auditLogs) {
    const relatedClinics = {
      actorClinicId: log.actor?.clinicId ?? null,
      patientClinicId: log.patient?.clinicId ?? null,
    };
    const clinicIds = [...new Set(Object.values(relatedClinics).filter((clinicId): clinicId is string => Boolean(clinicId)))];
    if (clinicIds.length > 1) {
      report('AUDIT_LOG_CROSS_CLINIC', log.id, relatedClinics);
    }
    // A zero-owner entry is a platform/legacy maintenance event. It has no
    // patient or operational actor relation, and AuditService deliberately
    // makes it invisible from every clinic endpoint. It therefore is not a
    // cross-tenant data exposure and cannot be safely attributed by this tool.
  }
  for (const link of parentChildLinks) {
    const parentClinicId = link.parent.clinicId;
    const childClinicId = link.child.clinicId;
    // Patient portals created before the tenant hardening can lack clinicId;
    // their explicit Patient relation remains auditable as an unresolved legacy
    // case rather than silently granting a cross-clinic parent link.
    if (!childClinicId || (parentClinicId && parentClinicId !== childClinicId)) {
      report('PARENT_CHILD_LINK_CROSS_CLINIC_OR_UNSCOPED', link.id, {
        parentClinicId,
        childClinicId,
      });
    }
  }
  for (const session of telehealthSessions) {
    const consultationClinicId = session.consultation.clinicId;
    if (!consultationClinicId || session.patient.clinicId !== consultationClinicId || session.doctor.clinicId !== consultationClinicId) {
      report('TELEHEALTH_SESSION_CROSS_CLINIC_OR_UNSCOPED', session.id, {
        consultationClinicId,
        patientClinicId: session.patient.clinicId,
        doctorClinicId: session.doctor.clinicId,
        patientUserClinicId: session.patientUser.clinicId,
      });
    }
  }

  // StockMovement intentionally has only a scalar supplierId in the legacy
  // schema. Resolve it through the tenant-owned Supplier table instead of
  // treating a scalar identifier as evidence of tenant ownership.
  const movementSupplierIds = [...new Set(stockMovements.map((movement) => movement.supplierId).filter((id): id is string => Boolean(id)))];
  const movementActorIds = [...new Set(stockMovements.map((movement) => movement.performedById).filter((id): id is string => Boolean(id)))];
  const [movementSuppliers, movementActors] = await Promise.all([
    prisma.supplier.findMany({ where: { id: { in: movementSupplierIds } }, select: { id: true, clinicId: true } }),
    prisma.user.findMany({ where: { id: { in: movementActorIds } }, select: { id: true, clinicId: true } }),
  ]);
  const supplierClinicById = new Map(movementSuppliers.map((supplier) => [supplier.id, supplier.clinicId]));
  const actorClinicById = new Map(movementActors.map((actor) => [actor.id, actor.clinicId]));
  for (const movement of stockMovements) {
    reportClinicalMismatch('STOCK_MOVEMENT', movement.id, movement.clinicId, {
      supplierClinicId: movement.supplierId ? supplierClinicById.get(movement.supplierId) ?? null : null,
      performedByClinicId: movement.performedById ? actorClinicById.get(movement.performedById) ?? null : null,
    });
  }

  for (const expense of legacyExpenses) {
    report('LEGACY_EXPENSE_WITHOUT_CLINIC', expense.id, {});
  }
  for (const revenue of legacyRevenues) {
    report('LEGACY_REVENUE_WITHOUT_CLINIC', revenue.id, {});
  }

  for (const user of users) {
    if (user.clinicId) continue;
    const employeeClinics = [...new Set(user.Employee.map((employee) => employee.clinicId).filter((clinicId): clinicId is string => Boolean(clinicId)))];
    const portalPatientClinicId = user.patientPortalProfile?.clinicId ?? null;
    if (user.primaryRole === RoleSlug.PATIENT && portalPatientClinicId) {
      report('PATIENT_PORTAL_USER_CLINIC_MISSING_DETERMINISTIC', user.id, {
        username: user.username,
        resolvedClinicId: portalPatientClinicId,
      }, true);
      continue;
    }
    if (employeeClinics.length === 1) {
      report('USER_CLINIC_MISSING_DETERMINISTIC', user.id, { username: user.username, role: user.primaryRole, resolvedClinicId: employeeClinics[0] }, true);
    } else {
      report('OPERATIONAL_USER_WITHOUT_CLINIC', user.id, { username: user.username, role: user.primaryRole, employeeClinicIds: employeeClinics });
    }
  }

  for (const employee of employees) {
    const userClinicId = employee.user?.clinicId ?? null;
    if (userClinicId && !employee.clinicId) {
      report('EMPLOYEE_CLINIC_MISSING_DETERMINISTIC', employee.id, { userId: employee.userId, clinicId: userClinicId }, true);
    } else if (!userClinicId && !employee.clinicId) {
      report('EMPLOYEE_AND_USER_WITHOUT_CLINIC', employee.id, { userId: employee.userId });
    } else if (userClinicId && employee.clinicId && userClinicId !== employee.clinicId) {
      report('USER_EMPLOYEE_CLINIC_CONFLICT', employee.id, { userId: employee.userId, userClinicId, employeeClinicId: employee.clinicId });
    } else if (!employee.userId && !employee.clinicId) {
      report('ORPHAN_EMPLOYEE_WITHOUT_CLINIC', employee.id, {});
    }
  }

  for (const unit of serviceUnits) {
    if (!unit.clinicId || !unit.department.clinicId || unit.clinicId !== unit.department.clinicId) {
      report('SERVICE_UNIT_DEPARTMENT_CROSS_CLINIC', unit.id, { serviceUnitClinicId: unit.clinicId, departmentClinicId: unit.department.clinicId });
      continue;
    }
    const expectedCategory = categoryForDepartmentType(unit.department.type);
    if (unit.category !== expectedCategory) {
      report('SERVICE_UNIT_CATEGORY_MISMATCH', unit.id, {
        clinicId: unit.clinicId,
        departmentType: unit.department.type,
        actualCategory: unit.category,
        expectedCategory,
      });
    }
  }

  const unitCategoriesByClinicAndName = new Map<string, Set<ServiceCategory>>();
  for (const unit of serviceUnits) {
    if (!unit.clinicId) continue;
    const key = `${unit.clinicId}:${unit.name.trim().toLocaleLowerCase()}`;
    const categories = unitCategoriesByClinicAndName.get(key) ?? new Set<ServiceCategory>();
    categories.add(unit.category);
    unitCategoriesByClinicAndName.set(key, categories);
  }
  for (const service of services) {
    const key = `${service.clinicId}:${service.name.trim().toLocaleLowerCase()}`;
    const unitCategories = unitCategoriesByClinicAndName.get(key);
    // Ambiguous duplicate names are deliberately reported only by the
    // provisioning audit; they are never auto-repaired by this tool.
    if (unitCategories?.size === 1 && !unitCategories.has(service.category)) {
      report('SERVICE_CATEGORY_UNIT_MISMATCH', service.id, {
        clinicId: service.clinicId,
        serviceCategory: service.category,
        unitCategory: [...unitCategories][0],
      });
    }
  }
  for (const assignment of roomAssignments) {
    const userClinicId = assignment.user.clinicId;
    const roomClinicId = assignment.room.serviceUnit.clinicId;
    if (!userClinicId || !roomClinicId || userClinicId !== roomClinicId) {
      report('ROOM_ASSIGNMENT_CROSS_CLINIC_OR_UNSCOPED', assignment.id, { userClinicId, roomClinicId });
    }
  }
  for (const configuration of configurations) {
    if (!configuration.clinicId) report('LAYER_CONFIGURATION_WITHOUT_CLINIC', configuration.id, {});
  }
  for (const company of subscriptionCompanies) {
    if (!company.clinicId) {
      report('SUBSCRIPTION_COMPANY_WITHOUT_CLINIC', company.id, {});
      continue;
    }
    for (const employee of company.employees) {
      if (employee.patient?.clinicId && employee.patient.clinicId !== company.clinicId) {
        report('SUBSCRIPTION_PATIENT_CROSS_CLINIC', employee.id, {
          companyId: company.id,
          companyClinicId: company.clinicId,
          patientClinicId: employee.patient.clinicId,
        });
      }
    }
    for (const monthlyInvoice of company.monthlyInvoices) {
      if (monthlyInvoice.invoice?.clinicId && monthlyInvoice.invoice.clinicId !== company.clinicId) {
        report('SUBSCRIPTION_INVOICE_CROSS_CLINIC', monthlyInvoice.id, {
          companyId: company.id,
          companyClinicId: company.clinicId,
          invoiceClinicId: monthlyInvoice.invoice.clinicId,
        });
      }
    }
  }
  for (const operatingRoom of operatingRooms) {
    if (!operatingRoom.clinicId) {
      report('OPERATING_ROOM_WITHOUT_CLINIC', operatingRoom.id, {});
      continue;
    }
    for (const surgery of operatingRoom.surgeries) {
      if (surgery.patient.clinicId !== operatingRoom.clinicId) {
        report('OPERATING_ROOM_SURGERY_CROSS_CLINIC', surgery.id, {
          operatingRoomId: operatingRoom.id,
          operatingRoomClinicId: operatingRoom.clinicId,
          patientClinicId: surgery.patient.clinicId,
        });
      }
    }
  }
  for (const catalogue of imagingCatalogues) {
    if (!catalogue.clinicId) {
      report('IMAGING_CATALOGUE_WITHOUT_CLINIC', catalogue.id, {});
      continue;
    }
    for (const request of catalogue.imagingRequests) {
      if (request.patient.clinicId !== catalogue.clinicId) {
        report('IMAGING_CATALOGUE_REQUEST_CROSS_CLINIC', request.id, {
          catalogueId: catalogue.id,
          catalogueClinicId: catalogue.clinicId,
          patientClinicId: request.patient.clinicId,
        });
      }
    }
  }
  for (const machine of imagingMachines) {
    if (!machine.clinicId) {
      report('IMAGING_MACHINE_WITHOUT_CLINIC', machine.id, {});
      continue;
    }
    for (const request of machine.imagingRequests) {
      if (request.patient.clinicId !== machine.clinicId) {
        report('IMAGING_MACHINE_REQUEST_CROSS_CLINIC', request.id, {
          machineId: machine.id,
          machineClinicId: machine.clinicId,
          patientClinicId: request.patient.clinicId,
        });
      }
    }
  }
  for (const plan of wearablePlans) {
    if (!plan.clinicId) {
      report('WEARABLE_PLAN_WITHOUT_CLINIC', plan.id, {});
      continue;
    }
    for (const lot of plan.lots) {
      if (lot.clinicId !== plan.clinicId) {
        report('WEARABLE_PLAN_LOT_CROSS_CLINIC', lot.id, { planId: plan.id, planClinicId: plan.clinicId, lotClinicId: lot.clinicId });
      }
    }
    for (const subscription of plan.subscriptions) {
      if (subscription.patient.clinicId !== plan.clinicId) {
        report('WEARABLE_PLAN_SUBSCRIPTION_CROSS_CLINIC', subscription.id, { planId: plan.id, planClinicId: plan.clinicId, patientClinicId: subscription.patient.clinicId });
      }
    }
  }
  for (const lot of wearableLots) {
    if (!lot.clinicId) {
      report('WEARABLE_LOT_WITHOUT_CLINIC', lot.id, {});
      continue;
    }
    if (lot.plan?.clinicId && lot.plan.clinicId !== lot.clinicId) {
      report('WEARABLE_LOT_PLAN_CROSS_CLINIC', lot.id, { lotClinicId: lot.clinicId, planClinicId: lot.plan.clinicId });
    }
    for (const inventory of lot.devices) {
      const patientClinicId = inventory.wearableDevice?.patient.clinicId;
      if (patientClinicId && patientClinicId !== lot.clinicId) {
        report('WEARABLE_INVENTORY_ASSIGNMENT_CROSS_CLINIC', inventory.id, { lotId: lot.id, lotClinicId: lot.clinicId, patientClinicId });
      }
    }
  }
}

async function repairDeterministicFindings() {
  for (const finding of findings.filter((entry) => entry.repairable)) {
    const clinicId = String(finding.detail.resolvedClinicId || finding.detail.clinicId);
    await prisma.$transaction(async (tx) => {
      if (
        finding.category === 'USER_CLINIC_MISSING_DETERMINISTIC' ||
        finding.category === 'PATIENT_PORTAL_USER_CLINIC_MISSING_DETERMINISTIC'
      ) {
        await tx.user.update({ where: { id: finding.id }, data: { clinicId } });
      }
      if (finding.category === 'EMPLOYEE_CLINIC_MISSING_DETERMINISTIC') {
        await tx.employee.update({ where: { id: finding.id }, data: { clinicId } });
      }
      await tx.auditTrail.create({
        data: {
          actorId: null,
          entity: 'CLINIC_MEMBERSHIP',
          entityId: finding.id,
          action: 'UPDATE',
          after: { event: 'CLINIC_MEMBERSHIP_REPAIRED', category: finding.category, clinicId, source: 'audit-tenant-integrity --apply' },
        },
      });
    });
  }
}

async function main() {
  await audit();
  const summary = findings.reduce<Record<string, number>>((result, finding) => {
    result[finding.category] = (result[finding.category] || 0) + 1;
    return result;
  }, {});
  console.info(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', findings: summary, details: findings }, null, 2));
  if (apply && findings.some((finding) => finding.repairable)) {
    await repairDeterministicFindings();
    console.info('Réparations déterministes appliquées. Relancez sans --apply pour confirmer les anomalies restantes.');
  }
  if (findings.some((finding) => !finding.repairable)) process.exitCode = 1;
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
