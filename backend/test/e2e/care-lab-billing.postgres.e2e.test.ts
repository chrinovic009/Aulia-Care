import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { CareAccessService } from '../../src/care-workflow/care-access.service';
import { CareWorkflowService } from '../../src/care-workflow/care-workflow.service';
import { CareUnitsService } from '../../src/care-workflow/care-units.service';
import { UnitExamReconciliationService } from '../../src/billing/unit-exam-reconciliation.service';
import { ClinicContextService } from '../../src/core/clinic-context.service';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL : un examen demandé par une unité passe par le laboratoire et sa facturation', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const access = new CareAccessService(new ClinicContextService(prisma as never));
  const engine = new CareWorkflowService(prisma as never, access);
  const suffix = randomUUID().slice(0, 10);
  let clinicId: string | undefined;

  try {
    const clinic = await prisma.clinic.create({ data: { name: `Lab bridge ${suffix}` } });
    clinicId = clinic.id;
    const user = (key: string, primaryRole: RoleSlug) => prisma.user.create({
      data: { clinicId: clinic.id, primaryRole, email: `${key}-${suffix}@e2e.local`, username: `${key}-${suffix}`, displayName: key, firstName: key, lastName: 'E2E', passwordHash: 'not-used' },
    });
    const [doctor, technician] = await Promise.all([user('urg', RoleSlug.PHYSICIAN), user('lab', RoleSlug.LAB_TECHNICIAN)]);
    const emergency = await prisma.careUnit.create({ data: { clinicId: clinic.id, kind: 'EMERGENCY', code: `URG-${suffix}`.toUpperCase(), name: 'Urgences' } });
    const laboratory = await prisma.careUnit.create({ data: { clinicId: clinic.id, kind: 'LABORATORY', code: `LAB-${suffix}`.toUpperCase(), name: 'Laboratoire' } });
    await prisma.careUnitAssignment.createMany({
      data: [
        { clinicId: clinic.id, careUnitId: emergency.id, userId: doctor.id, unitRole: 'LEAD' },
        { clinicId: clinic.id, careUnitId: laboratory.id, userId: technician.id, unitRole: 'MEMBER' },
      ],
    });
    const section = await prisma.labSection.create({ data: { clinicId: clinic.id, name: 'Hématologie' } });
    const category = await prisma.labCategory.create({ data: { clinicId: clinic.id, sectionId: section.id, name: 'Numération' } });
    const nfs = await prisma.labTest.create({ data: { clinicId: clinic.id, categoryId: category.id, code: 'NFS', name: 'Numération formule sanguine', price: 15 } });
    const patient = await prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Patient', lastName: `Labo ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') } });
    const doc = { userId: doctor.id };
    const tech = { userId: technician.id };
    const episode = await engine.openEpisode({ careUnitId: emergency.id, patientId: patient.id, start: true, priority: 'URGENT' }, doc);

    // The requesting unit chooses from the laboratory catalogue, which carries the price.
    const catalogue = await engine.laboratoryCatalogue(doc);
    assert.deepEqual(catalogue.map((item) => item.code), ['NFS']);
    await assert.rejects(() => engine.createRequest({
      patientId: patient.id, episodeId: episode.id, requesterUnitId: emergency.id, performerUnitId: laboratory.id,
      category: 'EXAMEN', code: 'INCONNU', label: 'Examen hors catalogue', priority: 'URGENT',
    }, doc), BadRequestException);

    const request = await engine.createRequest({
      patientId: patient.id, episodeId: episode.id, requesterUnitId: emergency.id, performerUnitId: laboratory.id,
      category: 'EXAMEN', code: 'nfs', label: '', priority: 'URGENT', reason: 'Fièvre',
    }, doc);
    assert.equal(request.code, 'NFS');
    assert.equal(request.label, 'Numération formule sanguine');

    // The exam exists in the laboratory module, without consultation, and is billed at the catalogue price.
    const labRequest = await prisma.labRequest.findUniqueOrThrow({ where: { serviceRequestId: request.id }, include: { items: true } });
    assert.equal(labRequest.consultationId, null);
    assert.equal(labRequest.status, 'REQUESTED');
    assert.equal(labRequest.items[0]?.labTestId, nfs.id);
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: labRequest.externalReference! } });
    assert.equal(invoice.type, 'LABORATORY');
    assert.equal(invoice.status, 'PENDING');
    assert.equal(Number(invoice.totalAmount), 15);
    assert.equal(await prisma.invoiceLine.count({ where: { invoiceId: invoice.id } }), 1);

    // The result entered by the laboratory unit is a technically validated laboratory result.
    const task = await prisma.careTask.findFirstOrThrow({ where: { requestId: request.id } });
    const accepted = await engine.changeTaskStatus(task.id, { version: task.version, status: 'ACCEPTED' }, tech);
    const reported = await engine.reportTaskResult(task.id, {
      version: accepted.version, summary: 'Hyperleucocytose',
      observations: [{ name: 'Leucocytes', value: '14,2', unit: 'G/L', referenceRange: '4-10', flag: 'HIGH' }], conclusion: 'Syndrome inflammatoire',
    }, tech);
    assert.equal((reported.payload as { laboratory?: { validation?: string } }).laboratory?.validation, 'PENDING_SECOND_SIGNATURE');
    const result = await prisma.labResult.findFirstOrThrow({ where: { labRequestId: labRequest.id }, include: { parameters: true } });
    // Second pair of eyes: the person who entered the result does not validate it.
    assert.equal(result.resultStatus, 'PENDING');
    assert.equal(result.technicalValidatedById, null);
    assert.equal(result.parameters[0]?.parameterName, 'Leucocytes');
    assert.equal(Number(result.parameters[0]?.valueNumeric), 14.2);
    assert.equal((await prisma.labRequest.findUniqueOrThrow({ where: { id: labRequest.id } })).status, 'TECHNICAL_VALIDATION');

    // A request revoked before any payment cancels the exam and its invoice.
    const second = await engine.createRequest({
      patientId: patient.id, episodeId: episode.id, requesterUnitId: emergency.id, performerUnitId: laboratory.id,
      category: 'EXAMEN', code: 'NFS', label: 'NFS de contrôle', priority: 'ROUTINE',
    }, doc);
    await engine.changeRequestStatus(second.id, { version: second.version, status: 'REVOKED', reason: 'Prescrite par erreur' }, doc);
    const cancelled = await prisma.labRequest.findUniqueOrThrow({ where: { serviceRequestId: second.id } });
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: cancelled.externalReference! } })).status, 'CANCELLED');

    // Imaging follows the same path: catalogue exam, imaging request without consultation, RADIOLOGY invoice, report.
    const radiologist = await user('radio', RoleSlug.RADIOLOGIST);
    const imagingUnit = await prisma.careUnit.create({ data: { clinicId: clinic.id, kind: 'IMAGING', code: `IMG-${suffix}`.toUpperCase(), name: 'Imagerie' } });
    await prisma.careUnitAssignment.create({ data: { clinicId: clinic.id, careUnitId: imagingUnit.id, userId: radiologist.id, unitRole: 'MEMBER' } });
    await prisma.imagingCatalogue.create({ data: { clinicId: clinic.id, code: 'RX-THORAX', name: 'Radiographie thoracique', price: 40, modality: 'XRAY' } });
    assert.deepEqual((await engine.imagingCatalogue(doc)).map((item) => item.code), ['RX-THORAX']);
    const xray = await engine.createRequest({
      patientId: patient.id, episodeId: episode.id, requesterUnitId: emergency.id, performerUnitId: imagingUnit.id,
      category: 'EXAMEN', code: 'rx-thorax', label: 'RX thorax', priority: 'URGENT', reason: 'Dyspnée',
    }, doc);
    const imagingRequest = await prisma.imagingRequest.findUniqueOrThrow({ where: { serviceRequestId: xray.id } });
    assert.equal(imagingRequest.consultationId, null);
    assert.equal(imagingRequest.modality, 'XRAY');
    const xrayInvoice = await prisma.invoice.findFirstOrThrow({ where: { clinicId: clinic.id, type: 'RADIOLOGY', remarks: { startsWith: `ImagingRequest:${imagingRequest.id} ` } } });
    assert.equal(Number(xrayInvoice.totalAmount), 40);
    assert.equal(xrayInvoice.status, 'PENDING');
    const xrayTask = await prisma.careTask.findFirstOrThrow({ where: { requestId: xray.id } });
    const xrayAccepted = await engine.changeTaskStatus(xrayTask.id, { version: xrayTask.version, status: 'ACCEPTED' }, { userId: radiologist.id });
    await engine.reportTaskResult(xrayTask.id, { version: xrayAccepted.version, summary: 'Opacité basale droite', conclusion: 'Pneumopathie probable' }, { userId: radiologist.id });
    const report = await prisma.imagingReport.findUniqueOrThrow({ where: { imagingRequestId: imagingRequest.id } });
    assert.equal(report.verified, false);
    assert.equal(report.impression, 'Pneumopathie probable');
    assert.equal((await prisma.imagingRequest.findUniqueOrThrow({ where: { id: imagingRequest.id } })).status, 'COMPLETED');

    // A patient covered by a company subscription: the exam goes to the monthly statement, not to the cashier.
    const company = await prisma.subscriptionCompany.create({ data: { clinicId: clinic.id, name: `Entreprise ${suffix}`, coversAllServices: true } });
    const covered = await prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Abonné', lastName: `Labo ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1980-01-01T00:00:00.000Z') } });
    await prisma.subscriptionEmployee.create({ data: { companyId: company.id, patientId: covered.id, firstName: 'Abonné', lastName: 'Labo', policyNumber: `POL-${suffix}` } });
    const coveredEpisode = await engine.openEpisode({ careUnitId: emergency.id, patientId: covered.id, start: true }, doc);
    const coveredRequest = await engine.createRequest({
      patientId: covered.id, episodeId: coveredEpisode.id, requesterUnitId: emergency.id, performerUnitId: laboratory.id,
      category: 'EXAMEN', code: 'NFS', label: 'NFS', priority: 'URGENT',
    }, doc);
    const coveredLab = await prisma.labRequest.findUniqueOrThrow({ where: { serviceRequestId: coveredRequest.id } });
    const coveredInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: coveredLab.externalReference! } });
    assert.equal(coveredInvoice.status, 'COVERED');
    assert.equal(Number(coveredInvoice.balanceDue), 0);
    const charge = await prisma.subscriptionCharge.findUniqueOrThrow({ where: { sourceInvoiceId: coveredInvoice.id } });
    assert.equal(Number(charge.amount), 15);
    await engine.changeRequestStatus(coveredRequest.id, { version: coveredRequest.version, status: 'REVOKED', reason: 'Doublon' }, doc);
    assert.equal((await prisma.subscriptionCharge.findUniqueOrThrow({ where: { id: charge.id } })).status, 'CANCELLED');
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: coveredInvoice.id } })).status, 'CANCELLED');

    // Protocols: only a clinician leading the unit validates; an administrative change lifts the validation.
    const admin = await user('admin', RoleSlug.ADMIN);
    const units = new CareUnitsService(prisma as never, new ClinicContextService(prisma as never));
    const scale = [{ code: '1', label: 'Immédiat', priority: 'STAT', maxWaitMinutes: 0 }, { code: '2', label: 'Très urgent', priority: 'ASAP', maxWaitMinutes: 10 }];
    await units.update(emergency.id, { settings: { triageScale: scale, triageScaleValidated: true } }, { userId: admin.id });
    let [triage] = await engine.unitProtocols(emergency.id, doc);
    assert.equal(triage.code, 'TRIAGE_SCALE');
    assert.equal(triage.validation, null);
    assert.equal(((await prisma.careUnit.findUniqueOrThrow({ where: { id: emergency.id } })).settings as { triageScaleValidated?: boolean }).triageScaleValidated, false);
    await assert.rejects(() => engine.validateProtocol(emergency.id, { protocol: 'TRIAGE_SCALE', fingerprint: triage.fingerprint }, tech), ForbiddenException);
    await assert.rejects(() => engine.validateProtocol(emergency.id, { protocol: 'TRIAGE_SCALE', fingerprint: 'stale' }, doc), ConflictException);
    await engine.validateProtocol(emergency.id, { protocol: 'TRIAGE_SCALE', fingerprint: triage.fingerprint, comment: 'Conforme au protocole de la direction médicale' }, doc);
    [triage] = await engine.unitProtocols(emergency.id, doc);
    assert.equal(triage.validation?.validatedById, doctor.id);
    assert.equal(((await prisma.careUnit.findUniqueOrThrow({ where: { id: emergency.id } })).settings as { triageScaleValidated?: boolean }).triageScaleValidated, true);
    await units.update(emergency.id, { settings: { triageScale: [{ ...scale[0] }, { ...scale[1], maxWaitMinutes: 20 }], triageScaleValidated: true } }, { userId: admin.id });
    [triage] = await engine.unitProtocols(emergency.id, doc);
    assert.equal(triage.validation, null);
    assert.equal(((await prisma.careUnit.findUniqueOrThrow({ where: { id: emergency.id } })).settings as { triageScaleValidated?: boolean }).triageScaleValidated, false);

    // Billing reconciliation: the exam performed above is still unpaid and is reported to finance.
    const reconciliation = new UnitExamReconciliationService(prisma as never, new ClinicContextService(prisma as never));
    const reconciliationReport = await reconciliation.report(30, { userId: admin.id });
    const performed = reconciliationReport.lines.find((row) => row.examId === labRequest.id);
    assert.equal(performed?.issue, 'PERFORMED_UNPAID');
    assert.ok(reconciliationReport.totals.performedUnpaid >= 1);
    await assert.rejects(() => reconciliation.report(30, doc), ForbiddenException);

    // A unit set to pay first: the exam waits for the cashier and no result can be entered before.
    await units.update(emergency.id, { settings: { billingPolicy: 'PAY_FIRST' } }, { userId: admin.id });
    const paid = await engine.createRequest({
      patientId: patient.id, episodeId: episode.id, requesterUnitId: emergency.id, performerUnitId: laboratory.id,
      category: 'EXAMEN', code: 'NFS', label: 'NFS (paiement préalable)', priority: 'ROUTINE',
    }, doc);
    assert.equal((await prisma.labRequest.findUniqueOrThrow({ where: { serviceRequestId: paid.id } })).status, 'AWAITING_PAYMENT');
    const paidTask = await prisma.careTask.findFirstOrThrow({ where: { requestId: paid.id } });
    const paidAccepted = await engine.changeTaskStatus(paidTask.id, { version: paidTask.version, status: 'ACCEPTED' }, tech);
    await assert.rejects(() => engine.reportTaskResult(paidTask.id, { version: paidAccepted.version, summary: 'Trop tôt' }, tech), ConflictException);
  } finally {
    if (clinicId) {
      await prisma.$executeRawUnsafe('ALTER TABLE "CareEvent" DISABLE TRIGGER "CareEvent_insert_only"');
      try {
        const where = { clinicId };
        await prisma.careEvent.deleteMany({ where });
        await prisma.careTask.deleteMany({ where });
        await prisma.labResultParameter.deleteMany({ where: { labResult: { labRequest: { clinicId } } } });
        await prisma.labResult.deleteMany({ where: { labRequest: { clinicId } } });
        await prisma.labRequestItem.deleteMany({ where: { labRequest: { clinicId } } });
        await prisma.labRequest.deleteMany({ where });
        await prisma.imagingReport.deleteMany({ where: { imagingRequest: { clinicId } } });
        await prisma.imagingRequest.deleteMany({ where });
        await prisma.imagingCatalogue.deleteMany({ where });
        await prisma.subscriptionCharge.deleteMany({ where: { company: { clinicId } } });
        await prisma.subscriptionEmployee.deleteMany({ where: { company: { clinicId } } });
        await prisma.subscriptionCompany.deleteMany({ where });
        await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: (await prisma.invoice.findMany({ where, select: { id: true } })).map((row) => row.id) } } });
        await prisma.invoice.deleteMany({ where });
        await prisma.labTest.deleteMany({ where });
        await prisma.labCategory.deleteMany({ where });
        await prisma.labSection.deleteMany({ where });
        await prisma.serviceRequest.deleteMany({ where });
        await prisma.careEpisode.deleteMany({ where });
        await prisma.careUnitAssignment.deleteMany({ where });
        await prisma.careUnit.deleteMany({ where });
        await prisma.notification.deleteMany({ where: { outboxEvent: { clinicId } } });
        await prisma.notificationOutbox.deleteMany({ where });
        await prisma.patient.deleteMany({ where });
        await prisma.user.deleteMany({ where });
        await prisma.clinic.deleteMany({ where: { id: clinicId } });
      } finally {
        await prisma.$executeRawUnsafe('ALTER TABLE "CareEvent" ENABLE TRIGGER "CareEvent_insert_only"');
      }
    }
    await prisma.$disconnect();
  }
});
