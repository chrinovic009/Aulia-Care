import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { CareAccessService } from '../../src/care-workflow/care-access.service';
import { CareWorkflowService } from '../../src/care-workflow/care-workflow.service';
import { WorkflowRuleError, eventsInForce } from '../../src/care-workflow/domain/workflow-rules';
import { ClinicContextService } from '../../src/core/clinic-context.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const ruleError = (code: string) => (error: unknown) => error instanceof WorkflowRuleError && error.code === code;

test('PostgreSQL : Care Workflow Engine, de la demande à l’exécution et au transfert entre unités', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const access = new CareAccessService(new ClinicContextService(prisma as never));
  const engine = new CareWorkflowService(prisma as never, access);
  const suffix = randomUUID().slice(0, 10);
  const clinicIds: string[] = [];

  const user = (clinicId: string, key: string, primaryRole: RoleSlug) => prisma.user.create({
    data: {
      clinicId, primaryRole, email: `${key}-${suffix}@e2e.local`, username: `${key}-${suffix}`,
      displayName: key, firstName: key, lastName: 'E2E', passwordHash: 'not-used',
    },
  });

  try {
    const clinic = await prisma.clinic.create({ data: { name: `Care Workflow ${suffix}` } });
    const otherClinic = await prisma.clinic.create({ data: { name: `Other ${suffix}` } });
    clinicIds.push(clinic.id, otherClinic.id);

    const [emergencyDoctor, surgeon, outsiderNurse, foreignDoctor] = await Promise.all([
      user(clinic.id, 'urg-doc', RoleSlug.PHYSICIAN),
      user(clinic.id, 'surgeon', RoleSlug.SURGEON),
      user(clinic.id, 'outsider', RoleSlug.NURSE),
      user(otherClinic.id, 'foreign', RoleSlug.PHYSICIAN),
    ]);
    const emergency = await prisma.careUnit.create({
      data: {
        clinicId: clinic.id, kind: 'EMERGENCY', code: `URG-${suffix}`.toUpperCase().slice(0, 32), name: 'Urgences',
        settings: { closureRequirements: [{ eventType: 'ORIENTATION', label: 'Décision d’orientation' }] },
      },
    });
    const surgery = await prisma.careUnit.create({ data: { clinicId: clinic.id, kind: 'SURGERY', code: `CHIR-${suffix}`.toUpperCase().slice(0, 32), name: 'Chirurgie' } });
    await prisma.careUnitAssignment.createMany({
      data: [
        { clinicId: clinic.id, careUnitId: emergency.id, userId: emergencyDoctor.id, unitRole: 'LEAD' },
        { clinicId: clinic.id, careUnitId: surgery.id, userId: surgeon.id, unitRole: 'MEMBER' },
      ],
    });
    const patient = await prisma.patient.create({
      data: { clinicId: clinic.id, firstName: 'Patient', lastName: `Flux ${suffix}`, gender: 'OTHER', dateOfBirth: new Date('1985-05-05T00:00:00.000Z') },
    });
    const doc = { userId: emergencyDoctor.id };
    const surg = { userId: surgeon.id };

    // 1. A stay is opened only by a member of the unit.
    const episode = await engine.openEpisode({ careUnitId: emergency.id, patientId: patient.id, start: true, priority: 'URGENT', reason: 'Douleur abdominale' }, doc);
    assert.equal(episode.status, 'IN_PROGRESS');
    await assert.rejects(() => engine.openEpisode({ careUnitId: emergency.id, patientId: patient.id }, { userId: outsiderNurse.id }), ForbiddenException);
    await assert.rejects(() => engine.openEpisode({ careUnitId: emergency.id, patientId: patient.id, start: true }, doc), ConflictException);

    // 2. Another establishment cannot even see the unit.
    await assert.rejects(() => engine.worklist(emergency.id, { userId: foreignDoctor.id }), NotFoundException);

    // 3. A request becomes a task for the performing unit, with a durable notification.
    const request = await engine.createRequest({
      patientId: patient.id, episodeId: episode.id, requesterUnitId: emergency.id, performerUnitId: surgery.id,
      category: 'SURGERY', code: 'APPENDICECTOMIE', label: 'Avis et intervention chirurgicale', priority: 'URGENT',
    }, doc);
    const [task] = await prisma.careTask.findMany({ where: { requestId: request.id } });
    assert.equal(task.careUnitId, surgery.id);
    assert.equal(task.status, 'REQUESTED');
    assert.ok(await prisma.notificationOutbox.count({ where: { clinicId: clinic.id, eventType: 'CARE_WORKFLOW' } }) >= 1);

    // 4. Only the performing unit handles the task; refusal needs a reason; stale versions are refused.
    await assert.rejects(() => engine.changeTaskStatus(task.id, { status: 'ACCEPTED', version: 1 }, doc), ForbiddenException);
    await assert.rejects(() => engine.changeTaskStatus(task.id, { status: 'REJECTED', version: 1 }, surg), ruleError('REASON_REQUIRED'));
    const accepted = await engine.changeTaskStatus(task.id, { status: 'ACCEPTED', version: 1 }, surg);
    assert.equal(accepted.status, 'ACCEPTED');
    await assert.rejects(() => engine.changeTaskStatus(task.id, { status: 'IN_PROGRESS', version: 1 }, surg), ConflictException);
    await assert.rejects(() => engine.changeRequestStatus(request.id, { status: 'COMPLETED', version: 1 }, surg), ConflictException);

    // 5. Events are insert-only, corrections keep the original.
    const vitals = await engine.recordCareEvent({ careUnitId: emergency.id, episodeId: episode.id, type: 'VITALS', summary: 'TA 12/8', payload: { systolic: 120 } }, doc);
    assert.equal(vitals.patientId, patient.id);
    await assert.rejects(() => prisma.careEvent.update({ where: { id: vitals.id }, data: { summary: 'falsifié' } }));
    await assert.rejects(() => prisma.careEvent.delete({ where: { id: vitals.id } }));
    const correction = await engine.correctCareEvent(vitals.id, { reason: 'Inversion de chiffres', summary: 'TA 13/8', payload: { systolic: 130 } }, doc);
    assert.equal(correction.correctsEventId, vitals.id);
    const episodeEvents = await prisma.careEvent.findMany({ where: { episodeId: episode.id } });
    assert.ok(episodeEvents.some((event) => event.id === vitals.id));
    assert.ok(!eventsInForce(episodeEvents).some((event) => event.id === vitals.id));

    // 6. Closure is blocked until the unit's mandatory steps are documented.
    await assert.rejects(() => engine.changeEpisodeStatus(episode.id, { status: 'COMPLETED', version: 1 }, doc), ruleError('MANDATORY_STEPS_MISSING'));

    // 7. Structured hand-off: acknowledged and accepted by the receiving unit, which opens its own stay.
    const transfer = await engine.sendTransfer({
      patientId: patient.id, fromUnitId: emergency.id, fromEpisodeId: episode.id, toUnitId: surgery.id, requestId: request.id,
      reason: 'Prise en charge chirurgicale', summary: { observations: 'Défense en fosse iliaque droite', medications: [] },
    }, doc);
    await assert.rejects(() => engine.decideTransfer(transfer.id, { decision: 'ACCEPT', version: 1 }, doc), ForbiddenException);
    const received = await engine.acknowledgeTransfer(transfer.id, { version: 1 }, surg);
    assert.equal(received.status, 'RECEIVED');
    const decided = await engine.decideTransfer(transfer.id, { decision: 'ACCEPT', version: 2 }, surg);
    assert.equal(decided.status, 'ACCEPTED');
    const surgicalStay = await prisma.careEpisode.findUniqueOrThrow({ where: { id: decided.toEpisodeId! } });
    assert.equal(surgicalStay.careUnitId, surgery.id);
    assert.equal(surgicalStay.parentEpisodeId, episode.id);

    // 8. Orientation documented: the emergency stay can now be closed.
    await engine.recordCareEvent({ careUnitId: emergency.id, episodeId: episode.id, type: 'ORIENTATION', summary: 'Transfert en chirurgie' }, doc);
    const closed = await engine.changeEpisodeStatus(episode.id, { status: 'COMPLETED', version: 1, outcome: 'TRANSFER_INTERNAL' }, doc);
    assert.equal(closed.status, 'COMPLETED');
    assert.ok(closed.endedAt);

    // 9. Shared chronology for a unit that took care of the patient; not for others.
    const timeline = await engine.patientTimeline(patient.id, surg);
    assert.ok(timeline.some((event) => event.type === 'TRANSFER_ACCEPTED'));
    await assert.rejects(() => engine.patientTimeline(patient.id, { userId: outsiderNurse.id }), ForbiddenException);
  } finally {
    if (clinicIds.length) {
      // Test teardown only: the insert-only trigger is lifted for this isolated database.
      await prisma.$executeRawUnsafe('ALTER TABLE "CareEvent" DISABLE TRIGGER "CareEvent_insert_only"');
      try {
        const where = { clinicId: { in: clinicIds } };
        await prisma.careEvent.deleteMany({ where });
        await prisma.careTransfer.deleteMany({ where });
        await prisma.careTask.deleteMany({ where });
        await prisma.careEpisode.updateMany({ where, data: { parentEpisodeId: null, sourceRequestId: null } });
        await prisma.serviceRequest.deleteMany({ where });
        await prisma.careEpisode.deleteMany({ where });
        await prisma.careUnitAssignment.deleteMany({ where });
        await prisma.careUnit.deleteMany({ where });
        await prisma.notification.deleteMany({ where: { outboxEvent: { clinicId: { in: clinicIds } } } });
        await prisma.notificationOutbox.deleteMany({ where });
        await prisma.patient.deleteMany({ where });
        await prisma.user.deleteMany({ where });
        await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
      } finally {
        await prisma.$executeRawUnsafe('ALTER TABLE "CareEvent" ENABLE TRIGGER "CareEvent_insert_only"');
      }
    }
    await prisma.$disconnect();
  }
});
