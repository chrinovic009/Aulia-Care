import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { CareAccessService } from '../../src/care-workflow/care-access.service';
import { CareWorkflowService } from '../../src/care-workflow/care-workflow.service';
import { WorkflowRuleError, eventsInForce } from '../../src/care-workflow/domain/workflow-rules';
import { BillingService } from '../../src/billing/billing.service';
import { PatientWorkflowService } from '../../src/core/patient-workflow.service';
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

    // 10. Unidentified arrival: a provisional record, triaged in one atomic step, then attached to the real record.
    const arrival = await engine.registerArrival(emergency.id, { provisional: { gender: 'MALE', estimatedAgeYears: 40, description: 'Veste bleue' }, arrivalMode: 'AMBULANCE' }, doc);
    assert.equal(arrival.patient.identityStatus, 'PROVISIONAL');
    assert.equal(arrival.patient.dateOfBirthEstimated, true);
    await assert.rejects(() => engine.registerArrival(emergency.id, { patientId: arrival.patientId }, doc), ConflictException);
    await engine.recordCareEvent({
      careUnitId: emergency.id, episodeId: arrival.id, type: 'TRIAGE', summary: 'Tri : niveau 2',
      payload: { level: '2' }, episodeUpdate: { version: arrival.version, stage: 'WAITING', priority: 'ASAP' },
    }, doc);
    const triaged = await prisma.careEpisode.findUniqueOrThrow({ where: { id: arrival.id } });
    assert.equal(triaged.stage, 'WAITING');
    assert.equal(triaged.priority, 'ASAP');
    // A stale version is refused and the event is not kept.
    await assert.rejects(() => engine.recordCareEvent({
      careUnitId: emergency.id, episodeId: arrival.id, type: 'TRIAGE', summary: 'Tri concurrent', episodeUpdate: { version: arrival.version, priority: 'STAT' },
    }, doc), ConflictException);
    assert.equal(await prisma.careEvent.count({ where: { episodeId: arrival.id, type: 'TRIAGE' } }), 1);
    const found = await engine.searchPatients(`Flux ${suffix}`, doc);
    assert.deepEqual(found.map((item) => item.id), [patient.id]);
    await assert.rejects(() => engine.searchPatients('Flux', { userId: outsiderNurse.id }), ForbiddenException);
    await assert.rejects(() => engine.mergeProvisionalPatient(arrival.patientId, { targetPatientId: patient.id, reason: 'Identifié par sa famille' }, surg), ForbiddenException);
    const merged = await engine.mergeProvisionalPatient(arrival.patientId, { targetPatientId: patient.id, reason: 'Identifié par sa famille' }, doc);
    assert.equal(merged.movedEpisodes, 1);
    assert.equal((await prisma.careEpisode.findUniqueOrThrow({ where: { id: arrival.id } })).patientId, patient.id);
    assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: arrival.patientId } })).identityStatus, 'MERGED');
    const mergedTimeline = await engine.patientTimeline(patient.id, doc);
    assert.ok(mergedTimeline.some((event) => event.type === 'ARRIVAL'), 'events of the provisional record appear in the definitive chronology');
    await assert.rejects(() => engine.registerArrival(emergency.id, { patientId: arrival.patientId }, doc), ForbiddenException);
    assert.ok((await engine.unitHistory(emergency.id, 7, doc)).some((item) => item.id === episode.id));

    // 10b. The performing unit reports a result: task completed, result on the requester's stay.
    const opinion = await engine.createRequest({
      patientId: patient.id, episodeId: arrival.id, requesterUnitId: emergency.id, performerUnitId: surgery.id,
      category: 'AVIS', code: 'AVIS-CHIR', label: 'Avis chirurgical', priority: 'URGENT',
    }, doc);
    const opinionTask = await prisma.careTask.findFirstOrThrow({ where: { requestId: opinion.id } });
    await assert.rejects(() => engine.reportTaskResult(opinionTask.id, { version: opinionTask.version, summary: 'Trop tôt' }, surg), ConflictException);
    const acceptedTask = await engine.changeTaskStatus(opinionTask.id, { version: opinionTask.version, status: 'ACCEPTED' }, surg);
    await assert.rejects(() => engine.reportTaskResult(opinionTask.id, { version: acceptedTask.version, summary: 'x' }, doc), ForbiddenException);
    const reported = await engine.reportTaskResult(opinionTask.id, {
      version: acceptedTask.version, summary: 'Pas d’indication opératoire',
      observations: [{ name: 'Défense abdominale', value: 'Absente', flag: 'NORMAL' }], conclusion: 'Surveillance',
    }, surg);
    assert.equal(reported.episodeId, arrival.id);
    assert.equal((await prisma.careTask.findUniqueOrThrow({ where: { id: opinionTask.id } })).status, 'COMPLETED');

    // 11. Ambulance mission: resources, offline-replayable steps, release on closure.
    const ambulance = await prisma.careUnit.create({
      data: {
        clinicId: clinic.id, kind: 'AMBULANCE', code: `AMB-${suffix}`.toUpperCase().slice(0, 32), name: 'SMUR',
        settings: { stageEventType: 'MISSION_STEP', stages: ['CALL', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORT', 'HANDOVER'] },
      },
    });
    await prisma.careUnitAssignment.create({ data: { clinicId: clinic.id, careUnitId: ambulance.id, userId: emergencyDoctor.id, unitRole: 'LEAD' } });
    await prisma.careUnitAssignment.create({ data: { clinicId: clinic.id, careUnitId: ambulance.id, userId: surgeon.id, unitRole: 'MEMBER' } });
    await assert.rejects(() => engine.createResource(ambulance.id, { kind: 'VEHICLE', code: 'AMB1', label: 'Ambulance 1' }, surg), ForbiddenException);
    const vehicle = await engine.createResource(ambulance.id, { kind: 'VEHICLE', code: 'amb1', label: 'Ambulance 1', details: { plate: 'TEST-001' } }, doc);
    assert.equal(vehicle.code, 'AMB1');
    const mission = await engine.registerArrival(ambulance.id, { provisional: { gender: 'UNKNOWN' }, reason: 'Accident de la route' }, doc);
    assert.equal(mission.stage, 'CALL');
    const engaged = await engine.updateResource(vehicle.id, { version: vehicle.version, assignedEpisodeId: mission.id }, surg);
    assert.equal(engaged.status, 'ENGAGED');
    await assert.rejects(() => engine.updateResource(vehicle.id, { version: engaged.version, status: 'MAINTENANCE', statusReason: 'Pneu' }, surg), ConflictException);
    const t0 = Date.now();
    await assert.rejects(() => engine.recordCareEvent({ careUnitId: ambulance.id, episodeId: mission.id, type: 'MISSION_STEP', summary: 'Saut interdit', payload: { stage: 'ON_SCENE' } }, surg), ruleError('STAGE_PREREQUISITE_MISSING'));
    for (const [index, stage] of ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE'].entries()) await engine.recordCareEvent({ careUnitId: ambulance.id, episodeId: mission.id, type: 'MISSION_STEP', summary: stage, payload: { stage }, occurredAt: new Date(t0 - 180_000 + index * 60_000).toISOString() }, surg);
    assert.equal((await prisma.careEpisode.findUniqueOrThrow({ where: { id: mission.id } })).stage, 'ON_SCENE');
    const scene = await prisma.careEvent.findFirstOrThrow({ where: { episodeId: mission.id, type: 'MISSION_STEP', payload: { path: ['stage'], equals: 'ON_SCENE' } } });
    await engine.correctCareEvent(scene.id, { reason: 'Mauvaise étape', retract: true }, surg);
    assert.equal((await prisma.careEpisode.findUniqueOrThrow({ where: { id: mission.id } })).stage, 'EN_ROUTE');
    for (const stage of ['ON_SCENE', 'TRANSPORT', 'HANDOVER']) await engine.recordCareEvent({ careUnitId: ambulance.id, episodeId: mission.id, type: 'MISSION_STEP', summary: stage, payload: { stage } }, surg);
    const current = await prisma.careEpisode.findUniqueOrThrow({ where: { id: mission.id } });
    await engine.changeEpisodeStatus(mission.id, { status: 'COMPLETED', version: current.version, outcome: 'HANDOVER' }, doc);
    const released = await prisma.careResource.findUniqueOrThrow({ where: { id: vehicle.id } });
    assert.equal(released.status, 'AVAILABLE');
    assert.equal(released.assignedEpisodeId, null);

    // 12. Maternity: one ongoing pregnancy per patient, the newborn gets its own record linked to the mother.
    const maternity = await prisma.careUnit.create({ data: { clinicId: clinic.id, kind: 'MATERNITY', code: `MAT-${suffix}`.toUpperCase().slice(0, 32), name: 'Maternité' } });
    await prisma.careUnitAssignment.create({ data: { clinicId: clinic.id, careUnitId: maternity.id, userId: surgeon.id, unitRole: 'MEMBER' } });
    const mother = await prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Maman', lastName: `Mat ${suffix}`, gender: 'FEMALE', dateOfBirth: new Date('1995-02-02T00:00:00.000Z') } });
    const pregnancy = await engine.createPregnancy(maternity.id, { patientId: mother.id, gravida: 2, parity: 1, expectedDeliveryDate: new Date(Date.now() + 86_400_000).toISOString() }, surg);
    await assert.rejects(() => engine.createPregnancy(maternity.id, { patientId: mother.id }, surg), ConflictException);
    await assert.rejects(() => engine.updatePregnancy(maternity.id, pregnancy.id, { version: pregnancy.version, status: 'ENDED' }, surg), /issue/);
    const labour = await engine.openEpisode({ careUnitId: maternity.id, patientId: mother.id, start: true, stage: 'LABOUR', reason: 'Travail' }, surg);
    const baby = await engine.registerNewborn(maternity.id, { motherEpisodeId: labour.id, sex: 'FEMALE', birthAt: new Date().toISOString(), measurements: { weightGrams: 3200 }, closePregnancy: true }, surg);
    const babyRecord = await prisma.patient.findUniqueOrThrow({ where: { id: baby.patientId } });
    assert.notEqual(babyRecord.id, mother.id);
    assert.equal(babyRecord.motherPatientId, mother.id);
    assert.equal(baby.parentEpisodeId, labour.id);
    assert.equal((await prisma.pregnancy.findUniqueOrThrow({ where: { id: pregnancy.id } })).status, 'DELIVERED');
    const register = await engine.maternityRegister(maternity.id, undefined, undefined, surg);
    assert.ok(register.some((event) => event.type === 'BIRTH' && event.patientId === mother.id));
    await assert.rejects(() => engine.listPregnancies(maternity.id, undefined, doc), ForbiddenException);
    // A corrected triage remains visible in the unit worklist.
    const triageEvent = await engine.recordCareEvent({ careUnitId: emergency.id, episodeId: arrival.id, type: 'TRIAGE', summary: 'Niveau 2', payload: { level: '2' } }, doc);
    const revisedTriage = await engine.correctCareEvent(triageEvent.id, { reason: 'Réévaluation clinique', summary: 'Niveau 1', payload: { level: '1' } }, doc);
    const urgencyList = await engine.worklist(emergency.id, doc);
    assert.ok(urgencyList.episodes.find(e => e.id === arrival.id)?.events.some(e => e.id === revisedTriage.id && (e.payload as { level?: string }).level === '1'));

    // Hospitalization orientation must create a real admission and claim a real bed atomically.
    const department = await prisma.department.create({ data: { clinicId: clinic.id, name: 'Hospitalisation', code: `HOSP-${suffix}`, type: 'MEDICAL' } });
    const inpatientUnit = await prisma.serviceUnit.create({ data: { clinicId: clinic.id, departmentId: department.id, name: 'Hospitalisation', category: 'OTHER_CLINICAL' } });
    const inpatientRoom = await prisma.room.create({ data: { serviceUnitId: inpatientUnit.id, number: suffix, name: 'Chambre recette' } });
    const admissionBed = await prisma.bed.create({ data: { roomId: inpatientRoom.id, code: 'BED1' } });
    const admissionPatient = await prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Admission', lastName: suffix, gender: 'OTHER', dateOfBirth: new Date('1980-01-01') } });
    const urgentStay = await engine.openEpisode({ careUnitId: emergency.id, patientId: admissionPatient.id, start: true }, doc);
    await assert.rejects(() => engine.admitFromEmergency(urgentStay.id, 99, admissionBed.id, 'Hospitalisation requise', doc), ConflictException);
    assert.equal(await prisma.hospitalization.count({ where: { patientId: admissionPatient.id } }), 0);
    assert.equal((await prisma.bed.findUniqueOrThrow({ where: { id: admissionBed.id } })).status, 'FREE');
    const admission = await engine.admitFromEmergency(urgentStay.id, urgentStay.version, admissionBed.id, 'Hospitalisation requise', doc);
    assert.equal((await prisma.bed.findUniqueOrThrow({ where: { id: admissionBed.id } })).hospitalizationId, admission.id);
    assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: admissionPatient.id } })).workflowStatus, 'HOSPITALISE');
    const urgentFresh = await engine.episodeDetail(urgentStay.id, doc);
    await engine.changeEpisodeStatus(urgentStay.id, { version: urgentFresh.version, status: 'COMPLETED', outcome: 'HOSPITALIZATION' }, doc);
    await assert.rejects(() => engine.authorizeClinicalDischarge(admissionPatient.id, emergency.id, doc), /encore ouverts/);

    // Composite delivery: twins, durable retry, rollback after an invalid child.
    const twinMother = await prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Twins', lastName: suffix, gender: 'FEMALE', dateOfBirth: new Date('1994-01-01') } });
    const twinStay = await engine.openEpisode({ careUnitId: maternity.id, patientId: twinMother.id, start: true, stage: 'LABOUR' }, surg);
    const birthDto = { motherEpisodeId: twinStay.id, version: twinStay.version, operationId: randomUUID(), birthAt: new Date().toISOString(), summary: 'Accouchement de jumeaux', details: {}, babies: [{ sex: 'FEMALE' as const }, { sex: 'MALE' as const }] };
    const twins = await engine.registerDelivery(maternity.id, birthDto, surg);
    assert.equal(twins.length, 2);
    assert.equal((await engine.registerDelivery(maternity.id, birthDto, surg)).length, 2);
    assert.equal(await prisma.careEpisode.count({ where: { parentEpisodeId: twinStay.id } }), 2);
    await assert.rejects(() => engine.createPregnancy(surgery.id, { patientId: twinMother.id }, surg), /maternité/);
    const rollbackMother = await prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Rollback', lastName: suffix, gender: 'FEMALE', dateOfBirth: new Date('1994-01-01') } });
    const rollbackStay = await engine.openEpisode({ careUnitId: maternity.id, patientId: rollbackMother.id, start: true, stage: 'LABOUR' }, surg);
    await assert.rejects(() => engine.registerDelivery(maternity.id, { ...birthDto, motherEpisodeId: rollbackStay.id, operationId: randomUUID(), babies: [{ sex: 'FEMALE' }, { sex: null as never }] }, surg));
    assert.equal(await prisma.careEvent.count({ where: { episodeId: rollbackStay.id, type: 'DELIVERY' } }), 0);
    assert.equal(await prisma.careEpisode.count({ where: { parentEpisodeId: rollbackStay.id } }), 0);
    assert.equal((await prisma.careEpisode.findUniqueOrThrow({ where: { id: rollbackStay.id } })).stage, 'LABOUR');

    // Dialysis: suspended prescription blocked; every stage and assessment required.
    const dialysis = await prisma.careUnit.create({ data: { clinicId: clinic.id, kind: 'DIALYSIS', code: `DIAL-${suffix}`.toUpperCase(), name: 'Dialyse', settings: { stageEventType: 'DIALYSIS_STEP', stages: ['ARRIVAL','PRE_WEIGHT','PRE_ASSESSMENT','ACCESS_CHECK','MACHINE_PREP','CONNECTION','START','MONITORING','END','DISCONNECTION','POST_ASSESSMENT','CLOSURE'] } } });
    await prisma.careUnitAssignment.createMany({ data: [{ clinicId: clinic.id, careUnitId: dialysis.id, userId: emergencyDoctor.id, unitRole: 'LEAD' }, { clinicId: clinic.id, careUnitId: dialysis.id, userId: outsiderNurse.id, unitRole: 'MEMBER' }] });
    const dialPatient = await prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Dialyse', lastName: suffix, gender: 'MALE', dateOfBirth: new Date('1980-01-01') } });
    await assert.rejects(() => engine.recordCareEvent({ careUnitId: dialysis.id, patientId: dialPatient.id, type: 'DIALYSIS_PRESCRIPTION', summary: 'Prescription', payload: { status: 'En cours' } }, { userId: outsiderNurse.id }), ruleError('PROFESSION_NOT_ALLOWED'));
    await engine.recordCareEvent({ careUnitId: dialysis.id, patientId: dialPatient.id, type: 'DIALYSIS_PRESCRIPTION', summary: 'Suspendue', payload: { status: 'Suspendue' } }, doc);
    await assert.rejects(() => engine.openEpisode({ careUnitId: dialysis.id, patientId: dialPatient.id, start: true, stage: 'ARRIVAL' }, doc), /active/);
    await engine.recordCareEvent({ careUnitId: dialysis.id, patientId: dialPatient.id, type: 'DIALYSIS_PRESCRIPTION', summary: 'Active', payload: { status: 'En cours' } }, doc);
    const dialStay = await engine.openEpisode({ careUnitId: dialysis.id, patientId: dialPatient.id, start: true, stage: 'ARRIVAL' }, doc);
    await assert.rejects(() => engine.changeEpisodeStatus(dialStay.id, { version: 1, status: 'COMPLETED' }, doc), ruleError('MANDATORY_STEPS_MISSING'));
    const machine = await engine.createResource(dialysis.id, { kind: 'MACHINE', code: 'MACHINE1', label: 'Générateur 1' }, doc);
    await engine.updateResource(machine.id, { version: machine.version, assignedEpisodeId: dialStay.id }, doc);
    for (const stage of ['PRE_WEIGHT','PRE_ASSESSMENT','ACCESS_CHECK','MACHINE_PREP','CONNECTION','START','MONITORING','END','DISCONNECTION','POST_ASSESSMENT']) await engine.recordCareEvent({ careUnitId: dialysis.id, episodeId: dialStay.id, type: 'DIALYSIS_STEP', summary: stage, payload: { stage } }, doc);
    for (const type of ['DIALYSIS_PRE_ASSESSMENT','DIALYSIS_SESSION_PARAMETERS','DIALYSIS_POST_ASSESSMENT']) await engine.recordCareEvent({ careUnitId: dialysis.id, episodeId: dialStay.id, type, summary: 'Évaluation clinique' }, doc);
    const dialFresh = await engine.episodeDetail(dialStay.id, doc);
    await engine.changeEpisodeStatus(dialStay.id, { version: dialFresh.version, status: 'COMPLETED' }, doc);
    await assert.rejects(() => engine.authorizeClinicalDischarge(dialPatient.id, dialysis.id, { userId: outsiderNurse.id }), ForbiddenException);
    const cashier = await user(clinic.id, 'cashier-specialty', RoleSlug.CASHIER);
    const billing = new BillingService(prisma as never, {} as never, new PatientWorkflowService());
    await assert.rejects(() => billing.authorizePatientDischarge(dialPatient.id, cashier.id), /autorisation du médecin/);
    await engine.authorizeClinicalDischarge(dialPatient.id, dialysis.id, doc);
    const invoice = await prisma.invoice.create({ data: { clinicId: clinic.id, patientId: dialPatient.id, issuedById: emergencyDoctor.id, type: 'SERVICE', totalAmount: 100, balanceDue: 100, status: 'PENDING' } });
    await assert.rejects(() => billing.authorizePatientDischarge(dialPatient.id, cashier.id), /solde/);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { balanceDue: 0, status: 'PAID' } });
    assert.equal((await prisma.patient.findUniqueOrThrow({ where: { id: dialPatient.id } })).workflowStatus, 'EN_ATTENTE_VALIDATION_CAISSE');
    assert.equal(await prisma.careEvent.count({ where: { patientId: dialPatient.id, type: 'DISCHARGE_AUTHORIZED', authorRole: 'PHYSICIAN' } }), 1);
    const discharge = await billing.authorizePatientDischarge(dialPatient.id, cashier.id);
    assert.equal(discharge.patient.workflowStatus, 'TERMINE');
    await prisma.invoice.delete({ where: { id: invoice.id } });

    // Surgery reservations serialize across concurrent patients and persist both representations.
    await prisma.careUnitAssignment.create({ data: { clinicId: clinic.id, careUnitId: surgery.id, userId: emergencyDoctor.id, unitRole: 'LEAD' } });
    await engine.createResource(surgery.id, { kind: 'ROOM', code: 'ROOM1', label: 'Bloc 1' }, doc);
    const candidates = await Promise.all(['A','B'].map(firstName => prisma.patient.create({ data: { clinicId: clinic.id, firstName, lastName: suffix, gender: 'OTHER', dateOfBirth: new Date('1980-01-01') } })));
    const schedule = { operationId: randomUUID(), scheduledAt: new Date(Date.now()+86400000).toISOString(), durationMinutes: 60, procedure: 'Intervention test', room: 'ROOM1' };
    const attempts = await Promise.allSettled(candidates.map((candidate, index) => engine.scheduleSurgery(surgery.id, { ...schedule, patientId: candidate.id, operationId: index ? randomUUID() : schedule.operationId }, doc)));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(result => result.status === 'rejected').length, 1);
    const winner = attempts.find(result => result.status === 'fulfilled');
    if (!winner || winner.status !== 'fulfilled') throw new Error('No reservation');
    const link = await prisma.careEvent.findFirstOrThrow({ where: { episodeId: winner.value.id, type: 'SURGERY_SCHEDULED' } });
    assert.ok((link.payload as { surgeryId?: string }).surgeryId);
    assert.equal(await prisma.surgery.count({ where: { patientId: { in: candidates.map(c => c.id) } } }), 1);
    await engine.changeEpisodeStatus(winner.value.id, { version: winner.value.version, status: 'IN_PROGRESS' }, doc);
    await engine.recordCareEvent({ careUnitId: surgery.id, episodeId: winner.value.id, type: 'CHECKLIST_ITEM', summary: 'Identité : problème', payload: { phase: 'SIGN_IN', item: 'Identité', answer: 'Problème : identité' } }, doc);
    const blockedSurgery = await engine.episodeDetail(winner.value.id, doc);
    await assert.rejects(() => engine.changeEpisodeStatus(winner.value.id, { version: blockedSurgery.version, status: 'COMPLETED' }, doc), ruleError('CHECKLIST_UNRESOLVED'));
    await assert.rejects(() => engine.authorizeClinicalDischarge(winner.value.patientId, surgery.id, doc), /encore ouverts/);
  } finally {
    if (clinicIds.length) {
      // Test teardown only: the insert-only trigger is lifted for this isolated database.
      await prisma.$executeRawUnsafe('ALTER TABLE "CareEvent" DISABLE TRIGGER "CareEvent_insert_only"');
      try {
        const where = { clinicId: { in: clinicIds } };
        await prisma.careEvent.deleteMany({ where });
        await prisma.careResource.deleteMany({ where });
        await prisma.careTransfer.deleteMany({ where });
        await prisma.careTask.deleteMany({ where });
        await prisma.careEpisode.updateMany({ where, data: { parentEpisodeId: null, sourceRequestId: null } });
        await prisma.serviceRequest.deleteMany({ where });
        await prisma.careEpisode.deleteMany({ where });
        await prisma.surgery.deleteMany({ where: { patient: { clinicId: { in: clinicIds } } } });
        await prisma.operatingRoom.deleteMany({ where });
        await prisma.careUnitAssignment.deleteMany({ where });
        await prisma.careUnit.deleteMany({ where });
        await prisma.notification.deleteMany({ where: { outboxEvent: { clinicId: { in: clinicIds } } } });
        await prisma.notificationOutbox.deleteMany({ where });
        await prisma.pregnancy.deleteMany({ where });
        await prisma.patient.updateMany({ where, data: { mergedIntoPatientId: null, motherPatientId: null } });
        await prisma.bed.updateMany({ where: { room: { serviceUnit: { clinicId: { in: clinicIds } } } }, data: { hospitalizationId: null } });
        await prisma.hospitalization.deleteMany({ where });
        await prisma.bed.deleteMany({ where: { room: { serviceUnit: { clinicId: { in: clinicIds } } } } });
        await prisma.room.deleteMany({ where: { serviceUnit: { clinicId: { in: clinicIds } } } });
        await prisma.serviceUnit.deleteMany({ where });
        await prisma.department.deleteMany({ where });
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
