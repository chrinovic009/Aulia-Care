import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PatientWorkflowStatus as S, Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PatientWorkflowService } from '../../src/core/patient-workflow.service';
import { decideWorkflowTransition } from '../../src/core/patient-workflow.policy';
import { runWithRequestContext } from '../../src/core/request-context';

const url = process.env.TEST_DATABASE_URL;
test('Core SQL pairs, bypass prevention, raw isolation, rollback, batching and context reset', {skip: !url}, async () => {
  const db = new PrismaService();
  await db.onModuleInit();
  const suffix = randomUUID();
  const a = await db.clinic.create({data:{name:'Core A '+suffix}});
  const b = await db.clinic.create({data:{name:'Core B '+suffix}});
  const user = await db.user.create({data:{clinicId:a.id,primaryRole:'PHYSICIAN',firstName:'Test',lastName:'Director',displayName:'Test',email:suffix+'@test.local',username:suffix,passwordHash:'unused'}});
  const p = await db.patient.create({data:{clinicId:a.id,firstName:'Test',lastName:suffix,gender:'OTHER',dateOfBirth:new Date('2000-01-01')}});
  const other = await db.patient.create({data:{clinicId:b.id,firstName:'Test',lastName:suffix,gender:'OTHER',dateOfBirth:new Date('2000-01-01')}});
  const asActor = <T>(work:()=>Promise<T>) => runWithRequestContext({userId:user.id,clinicId:a.id,role:'PHYSICIAN',roles:['MEDICAL_DIRECTOR'],route:'CORE TEST'}, async()=>await work());
  try {
    await assert.rejects(()=>asActor(()=>db.patient.update({where:{id:p.id},data:{workflowStatus:S.EN_CONSULTATION}})), /PatientWorkflowService/);
    let checked = 0;
    for (const from of Object.values(S)) for (const to of Object.values(S)) {
      await db.patient.update({where:{id:p.id},data:{workflowStatus:from}});
      const attempt = () => asActor(()=>db.$transaction(async tx => {
        await tx.$executeRaw`SELECT set_config('app.workflow_patient', ${p.id}, true)`;
        await tx.patient.update({where:{id:p.id},data:{workflowStatus:to}});
      }));
      if (decideWorkflowTransition(from,to).outcome === 'blocked') await assert.rejects(attempt, /interdite/);
      else await attempt();
      checked += 1;
    }
    assert.equal(checked, 121);
    const visible = await asActor(()=>db.$queryRaw<Array<{id:string}>>`SELECT id FROM "Patient" WHERE "lastName" = ${suffix}`);
    assert.deepEqual(visible.map(row=>row.id),[p.id]);
    const unsafe = await asActor(()=>db.$queryRawUnsafe<Array<{id:string}>>('SELECT id FROM "Patient" WHERE "lastName" = $1',suffix));
    assert.deepEqual(unsafe.map(row=>row.id),[p.id]);
    assert.equal(await asActor(()=>db.$executeRaw`UPDATE "Patient" SET city='intruder' WHERE id=${other.id}`),0);
    assert.equal(await asActor(()=>db.$executeRawUnsafe('UPDATE "Patient" SET city=$1 WHERE id=$2','intruder',other.id)),0);
    const batch = await asActor(()=>db.$transaction([db.patient.count({where:{lastName:suffix}}),db.$queryRaw<Array<{role:string}>>`SELECT current_user AS role`]));
    assert.equal(batch[0],1); assert.equal(batch[1][0]?.role,'aulia_app');
    await assert.rejects(()=>asActor(()=>db.$transaction(async tx=>{
      await tx.patient.update({where:{id:p.id},data:{city:'must rollback'}});
      throw new Error('rollback probe');
    })), /rollback probe/);
    assert.notEqual((await db.patient.findUniqueOrThrow({where:{id:p.id}})).city,'must rollback');
    await assert.rejects(()=>asActor(()=>db.$transaction([
      db.patient.update({where:{id:p.id},data:{city:'batch rollback'}}),
      db.$executeRaw(Prisma.sql`SELECT 1/0`),
    ])));
    assert.notEqual((await db.patient.findUniqueOrThrow({where:{id:p.id}})).city,'batch rollback');
    await db.patient.update({where:{id:p.id},data:{workflowStatus:S.HOSPITALISE}});
    const core = new PatientWorkflowService();
    const refused = await asActor(()=>db.$transaction(tx=>core.transitionDetailed(tx,p.id,S.EN_ATTENTE_MEDECIN,a.id)));
    assert.equal(refused.outcome,'blocked');
    const audit = await db.auditLog.findFirstOrThrow({where:{entity:'PatientWorkflow',entityId:p.id},orderBy:{createdAt:'desc'}});
    assert.equal(audit.actorId,user.id); assert.equal((audit.metadata as {actorRole:string}).actorRole,'PHYSICIAN');
    await asActor(()=>db.patient.update({where:{id:p.id},data:{city:'director write'}}));
    const ledger = await db.$queryRaw<Array<{actorRole:string,context:{roles:string[]}}>>`SELECT "actorRole",context FROM "AuditLedger" WHERE "entityId"=${p.id} AND "actorId"=${user.id} ORDER BY id DESC LIMIT 1`;
    assert.equal(ledger[0]?.actorRole,'PHYSICIAN'); assert.deepEqual(ledger[0]?.context.roles,['MEDICAL_DIRECTOR']);
    await Promise.all([asActor(()=>db.patient.count({where:{lastName:suffix}})),runWithRequestContext({userId:user.id,clinicId:b.id,role:'PHYSICIAN'},async()=>assert.equal(await db.patient.count({where:{lastName:suffix}}),1))]);
    const reset = await db.$queryRaw<Array<{role:string,clinic:string|null}>>`SELECT current_user AS role,current_setting('app.clinic_id',true) AS clinic`;
    assert.notEqual(reset[0]?.role,'aulia_app'); assert.ok(!reset[0]?.clinic);
    assert.equal(await db.patient.count({where:{lastName:suffix}}),2);
  } finally {
    await db.auditLog.deleteMany({where:{entityId:p.id}});
    await db.patient.deleteMany({where:{id:{in:[p.id,other.id]}}});
    await db.user.delete({where:{id:user.id}});
    await db.clinic.deleteMany({where:{id:{in:[a.id,b.id]}}});
    await db.$disconnect();
  }
});
