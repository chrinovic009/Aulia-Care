import assert from 'node:assert/strict';
import test from 'node:test';
import { defer, lastValueFrom } from 'rxjs';
import { ExecutionContext } from '@nestjs/common';
import { RequestContextInterceptor } from './request-context.interceptor';
import { currentRequestContext } from './request-context';
import { PrismaService } from '../prisma/prisma.service';

test('a rolled-back strict refusal is attributed and persisted before the HTTP error returns', async () => {
  const records: Array<{actorId?: string}> = [];
  const prisma = {$transaction: async (work: (tx: unknown)=>Promise<void>) => work({auditLog:{create:async ({data}:{data:{actorId:string}})=>{records.push(data);}}})} as unknown as PrismaService;
  const context = {getType:()=> 'http',switchToHttp:()=>({getRequest:()=>({user:{userId:'doctor',clinicId:'clinic',role:'PHYSICIAN',roles:['MEDICAL_DIRECTOR']},method:'POST',path:'/consultation'})})} as unknown as ExecutionContext;
  const stream = new RequestContextInterceptor(prisma).intercept(context,{handle:()=>defer(async()=>{
    const actor = currentRequestContext();
    assert.deepEqual(actor?.roles,['MEDICAL_DIRECTOR']);
    actor?.rejectedWorkflowWrites?.push({actorId:actor.userId,action:'REJECT',entity:'PatientWorkflow',entityId:'patient',summary:'Refused'});
    throw new Error('rolled back');
  })});
  await assert.rejects(()=>lastValueFrom(stream), /rolled back/);
  assert.equal(records.length,1);
  assert.equal(records[0].actorId,'doctor');
});
