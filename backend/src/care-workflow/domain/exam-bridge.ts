import { BadRequestException, ConflictException } from '@nestjs/common';
import { OperationalClinicActor } from '../../core/clinic-context.service';
import { cancelSubscriptionChargeForInvoice, chargeInvoiceToSubscription } from '../../billing/subscription-coverage';
import type { Db } from '../care-access.service';
import type { ReportTaskResultDto } from '../dto/care-workflow.dto';

/*
 * Exam bridge of the Care Workflow Engine: an exam a care unit asks of a
 * LABORATORY or IMAGING unit becomes a LabRequest / ImagingRequest of that
 * module, with its invoice at the catalogue price (or the company
 * subscription), its payment hold (PAY_FIRST units) and its result.
 * Extracted from care-workflow.service.ts; every function runs inside the
 * caller's transaction.
 */

export async function findImagingExam(tx: Db, actor: OperationalClinicActor, code: string) {
  const value = code.trim();
  const exam = await tx.imagingCatalogue.findFirst({
    where: { clinicId: actor.clinicId, active: true, deletedAt: null, OR: [{ id: value }, { code: { equals: value, mode: 'insensitive' } }] },
  });
  if (!exam) throw new BadRequestException(`L’examen « ${value} » n’est pas dans le catalogue d’imagerie : choisissez un examen du catalogue (il porte le tarif facturé).`);
  if (Number(exam.price) <= 0) throw new BadRequestException(`Le tarif de l’examen « ${exam.name} » n’est pas renseigné dans le catalogue d’imagerie.`);
  return exam;
}

async function openImagingExam(
  tx: Db, actor: OperationalClinicActor,
  request: { id: string; patientId: string; code: string; label: string; reason: string | null; priority: string; requesterId: string },
  unitName: string,
) {
  const existing = await tx.imagingRequest.findFirst({ where: { serviceRequestId: request.id }, select: { id: true } });
  if (existing) return existing;
  const exam = await findImagingExam(tx, actor, request.code);
  const price = Number(exam.price);
  const imagingRequest = await tx.imagingRequest.create({
    data: {
      clinicId: actor.clinicId, patientId: request.patientId, serviceRequestId: request.id, consultationId: null,
      requestedById: request.requesterId, imagingCatalogueId: exam.id, modality: exam.modality, bodyPart: exam.name,
      urgency: request.priority === 'ROUTINE' ? 'ROUTINE' : 'URGENT', status: 'REQUESTED',
      clinicalIndication: [request.reason, `Demande de l’unité ${unitName}`].filter(Boolean).join(' — '),
    },
  });
  const invoice = await tx.invoice.create({
    data: {
      clinicId: actor.clinicId, patientId: request.patientId, issuedById: actor.id, type: 'RADIOLOGY', status: 'PENDING',
      totalAmount: price, balanceDue: price,
      remarks: `ImagingRequest:${imagingRequest.id} - Demande imagerie ${exam.name} (unité ${unitName})`,
    },
  });
  await tx.invoiceLine.create({ data: { invoiceId: invoice.id, label: `Examen d'imagerie - ${exam.name}`, quantity: 1, unitPrice: price, totalAmount: price } });
  await chargeInvoiceToSubscription(tx, request.patientId, actor.clinicId, invoice.id, `Examen d'imagerie - ${exam.name}`, price, null);
  return imagingRequest;
}

export async function cancelImagingExam(tx: Db, actor: OperationalClinicActor, serviceRequestId: string, reason: string | null) {
  const imagingRequest = await tx.imagingRequest.findFirst({ where: { serviceRequestId }, select: { id: true, status: true } });
  if (!imagingRequest || ['COMPLETED', 'VERIFIED', 'CANCELLED'].includes(imagingRequest.status)) return null;
  await tx.imagingRequest.update({ where: { id: imagingRequest.id }, data: { status: 'CANCELLED', notes: reason ? `Annulée : ${reason}` : 'Annulée par l’unité demandeuse' } });
  const invoice = await tx.invoice.findFirst({
    where: { clinicId: actor.clinicId, type: 'RADIOLOGY', remarks: { startsWith: `ImagingRequest:${imagingRequest.id} ` } },
    select: { id: true },
  });
  return { imagingRequestId: imagingRequest.id, invoiceCancelled: invoice ? await cancelExamInvoice(tx, invoice.id) : false };
}

/** The unit's report becomes the imaging report, to be verified by the radiologist in the imaging module. */
export async function recordImagingReport(tx: Db, actor: OperationalClinicActor, serviceRequestId: string, dto: ReportTaskResultDto) {
  const imagingRequest = await tx.imagingRequest.findFirst({ where: { serviceRequestId }, select: { id: true, report: { select: { id: true } } } });
  if (!imagingRequest) return null;
  if (imagingRequest.report) throw new ConflictException('Un compte rendu existe déjà pour cet examen : amendez-le dans le module Imagerie.');
  const findings = [dto.summary.trim(), ...(dto.observations ?? []).map((obs) => `${obs.name} : ${obs.value}${obs.unit ? ` ${obs.unit}` : ''}${obs.flag && obs.flag !== 'NORMAL' ? ` (${obs.flag})` : ''}`)].join('\n');
  const report = await tx.imagingReport.create({
    data: { imagingRequestId: imagingRequest.id, interpretedById: actor.id, findings, impression: dto.conclusion?.trim() || dto.summary.trim(), verified: false },
  });
  await tx.imagingRequest.update({ where: { id: imagingRequest.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  return { imagingRequestId: imagingRequest.id, imagingReportId: report.id };
}

/**
 * Invoice of a cancelled exam: cancelled when nothing was paid; a company
 * subscription charge not yet on a monthly statement is cancelled with it.
 */
async function cancelExamInvoice(tx: Db, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, _count: { select: { payments: true } } } });
  if (!invoice || invoice._count.payments > 0) return false;
  if (invoice.status === 'COVERED' && !(await cancelSubscriptionChargeForInvoice(tx, invoiceId))) return false;
  if (invoice.status !== 'PENDING' && invoice.status !== 'COVERED') return false;
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'CANCELLED', balanceDue: 0 } });
  return true;
}


// ================================================================ laboratory bridge
/*
 * An exam a care unit asks of a LABORATORY unit goes through the laboratory
 * module like an exam ordered in consultation: a LabRequest (linked to the
 * request, without consultation) and a LABORATORY invoice at the catalogue
 * price, settled at the cashier. Care does not wait for the payment.
 */

/** Exams asked of the laboratory or imaging go through their module and their billing. */
export async function openExam(
  tx: Db, actor: OperationalClinicActor, performerKind: string,
  request: { id: string; patientId: string; code: string; label: string; reason: string | null; priority: string; requesterId: string; requesterUnitId: string | null },
) {
  if (performerKind !== 'LABORATORY' && performerKind !== 'IMAGING') return null;
  const unit = request.requesterUnitId ? await tx.careUnit.findUnique({ where: { id: request.requesterUnitId }, select: { name: true, settings: true } }) : null;
  const unitName = unit?.name ?? 'hors unité';
  // Billing policy of the requesting unit: emergency-type units bill after care (default);
  // a unit set to PAY_FIRST sends the exam only once the cashier has been paid.
  const payFirst = (unit?.settings as { billingPolicy?: string } | null)?.billingPolicy === 'PAY_FIRST';
  const exam = performerKind === 'LABORATORY' ? await openLabExam(tx, actor, request, unitName) : await openImagingExam(tx, actor, request, unitName);
  if (payFirst) await holdUntilPaid(tx, performerKind, exam.id);
  return exam;
}

/** PAY_FIRST: the exam waits for the cashier, unless a company subscription covers it. */
async function holdUntilPaid(tx: Db, kind: string, examId: string) {
  if (kind === 'LABORATORY') {
    const lab = await tx.labRequest.findUniqueOrThrow({ where: { id: examId }, select: { externalReference: true } });
    const invoice = lab.externalReference ? await tx.invoice.findUnique({ where: { id: lab.externalReference }, select: { status: true } }) : null;
    if (invoice?.status === 'COVERED' || invoice?.status === 'PAID') return;
    await tx.labRequest.update({ where: { id: examId }, data: { status: 'AWAITING_PAYMENT' } });
    await tx.labRequestItem.updateMany({ where: { labRequestId: examId }, data: { status: 'AWAITING_PAYMENT' } });
    return;
  }
  const invoice = await tx.invoice.findFirst({ where: { type: 'RADIOLOGY', remarks: { startsWith: `ImagingRequest:${examId} ` } }, select: { status: true } });
  if (invoice?.status === 'COVERED' || invoice?.status === 'PAID') return;
  await tx.imagingRequest.update({ where: { id: examId }, data: { status: 'AWAITING_PAYMENT' } });
}

/** A result cannot be entered for an exam still waiting for its payment (PAY_FIRST units). */
export async function assertExamReleased(tx: Db, serviceRequestId: string) {
  const [lab, imaging] = await Promise.all([
    tx.labRequest.findFirst({ where: { serviceRequestId }, select: { status: true } }),
    tx.imagingRequest.findFirst({ where: { serviceRequestId }, select: { status: true } }),
  ]);
  if (lab?.status === 'AWAITING_PAYMENT' || imaging?.status === 'AWAITING_PAYMENT') {
    throw new ConflictException('Cet examen attend son paiement à la caisse (unité en paiement préalable).');
  }
}

export async function findLabTest(tx: Db, actor: OperationalClinicActor, code: string) {
  const value = code.trim();
  const labTest = await tx.labTest.findFirst({
    where: { clinicId: actor.clinicId, active: true, OR: [{ id: value }, { code: { equals: value, mode: 'insensitive' } }] },
  });
  if (!labTest) throw new BadRequestException(`L’examen « ${value} » n’est pas dans le catalogue du laboratoire : choisissez un examen du catalogue (il porte le tarif facturé).`);
  if (labTest.price === null || Number(labTest.price) <= 0) throw new BadRequestException(`Le tarif de l’examen « ${labTest.name} » n’est pas renseigné dans le catalogue du laboratoire.`);
  return labTest;
}

async function openLabExam(
  tx: Db, actor: OperationalClinicActor,
  request: { id: string; patientId: string; code: string; label: string; reason: string | null; priority: string; requesterId: string },
  unitName: string,
) {
  const existing = await tx.labRequest.findFirst({ where: { serviceRequestId: request.id }, select: { id: true } });
  if (existing) return existing;
  const labTest = await findLabTest(tx, actor, request.code);
  const price = Number(labTest.price);
  const labRequest = await tx.labRequest.create({
    data: {
      clinicId: actor.clinicId, patientId: request.patientId, serviceRequestId: request.id, consultationId: null,
      requestedById: request.requesterId, status: 'REQUESTED', specimenType: labTest.name,
      priority: request.priority === 'ROUTINE' ? 'NORMAL' : 'URGENT',
      notes: [`Demande de l’unité ${unitName}`, request.reason].filter(Boolean).join(' — '),
    },
  });
  await tx.labRequestItem.create({
    data: { labRequestId: labRequest.id, labTestId: labTest.id, status: 'REQUESTED', requestedAt: labRequest.requestedAt, specimenLabel: labTest.name, notes: request.reason },
  });
  const invoice = await tx.invoice.create({
    data: {
      clinicId: actor.clinicId, patientId: request.patientId, issuedById: actor.id, type: 'LABORATORY', status: 'PENDING',
      totalAmount: price, balanceDue: price,
      remarks: `LabRequest:${labRequest.id} - Demande laboratoire ${labRequest.id} - ${labTest.name} (unité ${unitName})`,
    },
  });
  await tx.invoiceLine.create({ data: { invoiceId: invoice.id, label: `Examen laboratoire - ${labTest.name}`, quantity: 1, unitPrice: price, totalAmount: price } });
  await tx.labRequest.update({ where: { id: labRequest.id }, data: { externalReference: invoice.id } });
  // A subscribed patient's exam goes to the company's monthly statement, as in consultation.
  await chargeInvoiceToSubscription(tx, request.patientId, actor.clinicId, invoice.id, `Examen laboratoire - ${labTest.name}`, price, null);
  return labRequest;
}

/** A revoked request cancels its exam and, when nothing was paid yet, its invoice. */
export async function cancelLabExam(tx: Db, serviceRequestId: string, reason: string | null) {
  const labRequest = await tx.labRequest.findFirst({ where: { serviceRequestId }, select: { id: true, status: true, externalReference: true } });
  if (!labRequest || ['AVAILABLE', 'SENT', 'COMPLETED', 'VERIFIED', 'CANCELLED'].includes(labRequest.status)) return null;
  await tx.labRequest.update({ where: { id: labRequest.id }, data: { status: 'CANCELLED', notes: reason ? `Annulée : ${reason}` : 'Annulée par l’unité demandeuse' } });
  await tx.labRequestItem.updateMany({ where: { labRequestId: labRequest.id, deletedAt: null }, data: { status: 'CANCELLED' } });
  if (!labRequest.externalReference) return { labRequestId: labRequest.id, invoiceCancelled: false };
  return { labRequestId: labRequest.id, invoiceCancelled: await cancelExamInvoice(tx, labRequest.externalReference) };
}

/** The unit's result becomes a laboratory result awaiting validation by another person of the laboratory. */
export async function recordLabResult(tx: Db, actor: OperationalClinicActor, serviceRequestId: string, dto: ReportTaskResultDto) {
  const labRequest = await tx.labRequest.findFirst({ where: { serviceRequestId }, include: { items: { where: { deletedAt: null }, include: { labTest: true } } } });
  if (!labRequest) return null;
  const item = labRequest.items[0];
  const now = new Date();
  const numeric = (value: string) => { const n = Number(value.replace(',', '.')); return /^-?\d+([.,]\d+)?$/.test(value.trim()) && Number.isFinite(n) ? n : null; };
  const result = await tx.labResult.create({
    data: {
      labRequestId: labRequest.id, labRequestItemId: item?.id ?? null,
      resultCode: item?.labTest.code ?? 'UNIT', resultName: item?.labTest.name ?? 'Résultat',
      resultStatus: 'PENDING', resultValue: dto.summary.trim(), interpretation: dto.conclusion?.trim() || null,
      reportedById: actor.id, reportedAt: now,
      parameters: {
        create: (dto.observations ?? []).map((obs) => ({
          parameterName: obs.name, valueText: obs.value, valueNumeric: numeric(obs.value), unit: obs.unit || null,
          referenceRange: obs.referenceRange || null, interpretation: obs.flag || null, reportedById: actor.id, reportedAt: now,
        })),
      },
    },
  });
  await tx.labRequest.update({ where: { id: labRequest.id }, data: { status: 'TECHNICAL_VALIDATION', performedAt: labRequest.performedAt ?? now } });
  await tx.labRequestItem.updateMany({ where: { labRequestId: labRequest.id, deletedAt: null, status: { not: 'CANCELLED' } }, data: { status: 'TECHNICAL_VALIDATION', completedAt: now } });
  return { labRequestId: labRequest.id, labResultId: result.id };
}

