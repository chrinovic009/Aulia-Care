import { Prisma } from '@prisma/client';

/**
 * A patient covered by a company subscription (covers all services, within
 * the credit limit) has the invoice charged to the company's monthly
 * statement: the invoice becomes COVERED. Shared by consultations and care
 * units so that every billable exam follows the same rule. Returns true when
 * the invoice is covered.
 */
export async function chargeInvoiceToSubscription(
  tx: any,
  patientId: string,
  clinicId: string,
  invoiceId: string,
  label: string,
  amount: number | Prisma.Decimal,
  serviceId?: string | null,
): Promise<boolean> {
  const employee = await tx.subscriptionEmployee.findFirst({
    where: {
      patientId,
      deletedAt: null,
      status: 'ACTIVE',
      patient: { clinicId, deletedAt: null },
      company: { clinicId, status: 'ACTIVE', deletedAt: null },
    },
    include: { company: true },
  });
  if (!employee) return false;
  if (!employee.company.coversAllServices) return false;

  // The company lock protects both credit-limit decisions and monthly
  // consolidation from concurrent charges for this establishment.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-company:${employee.companyId}`}))`;

  // The invoice is the immutable origin of a corporate charge. Replaying an
  // order must not add the same expense twice to the monthly statement.
  const existingCharge = await tx.subscriptionCharge.findFirst({
    where: { sourceInvoiceId: invoiceId, companyId: employee.companyId, deletedAt: null },
    select: { id: true },
  });
  if (existingCharge) return true;

  if (employee.company.creditLimit !== null) {
    const [unbilled, billed] = await Promise.all([
      tx.subscriptionCharge.aggregate({
        where: { companyId: employee.companyId, status: 'PENDING_MONTHLY_INVOICE', deletedAt: null },
        _sum: { amount: true },
      }),
      tx.invoice.aggregate({
        where: {
          clinicId,
          type: 'SUBSCRIPTION_MONTHLY',
          deletedAt: null,
          status: { not: 'CANCELLED' },
          monthlySubscriptionInvoices: { some: { companyId: employee.companyId, deletedAt: null } },
        },
        _sum: { balanceDue: true },
      }),
    ]);
    const exposure = new Prisma.Decimal(unbilled._sum.amount || 0)
      .plus(billed._sum.balanceDue || 0)
      .plus(amount);
    if (exposure.gt(employee.company.creditLimit)) return false;
  }

  const serviceDate = new Date();
  await tx.subscriptionCharge.create({
    data: {
      companyId: employee.companyId,
      employeeId: employee.id,
      patientId,
      invoiceId,
      sourceInvoiceId: invoiceId,
      serviceId: serviceId || null,
      label,
      amount,
      currency: 'CDF',
      serviceDate,
      month: serviceDate.getMonth() + 1,
      year: serviceDate.getFullYear(),
    },
  });

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      // Coverage authorizes service, but is not money collected by a cashier.
      status: 'COVERED',
      balanceDue: 0,
    },
  });

  return true;
}

/** An exam cancelled before the monthly statement leaves it: its pending charge is cancelled too. */
export async function cancelSubscriptionChargeForInvoice(tx: any, invoiceId: string): Promise<boolean> {
  const cancelled = await tx.subscriptionCharge.updateMany({
    where: { sourceInvoiceId: invoiceId, status: 'PENDING_MONTHLY_INVOICE', deletedAt: null },
    data: { status: 'CANCELLED' },
  });
  return cancelled.count > 0;
}
