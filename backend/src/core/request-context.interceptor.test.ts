import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defer, lastValueFrom } from 'rxjs';
import { ExecutionContext } from '@nestjs/common';
import { RequestContextInterceptor } from './request-context.interceptor';
import { currentRequestContext } from './request-context';
import { pendingAuditCount } from './audit-spool';
import { PrismaService } from '../prisma/prisma.service';

const httpContext = {getType:()=> 'http',switchToHttp:()=>({getRequest:()=>({user:{userId:'doctor',clinicId:'clinic',role:'PHYSICIAN',roles:['MEDICAL_DIRECTOR']},method:'POST',path:'/consultation'})})} as unknown as ExecutionContext;
const refusingHandler = {handle:()=>defer(async()=>{
  const actor = currentRequestContext();
  actor?.rejectedWorkflowWrites?.push({actorId:actor.userId,action:'REJECT',entity:'PatientWorkflow',entityId:'patient',summary:'Refused'});
  throw new Error('rolled back');
})};

test('a rolled-back strict refusal is attributed and persisted before the HTTP error returns', async () => {
  process.env.AULIA_AUDIT_SPOOL_DIR = mkdtempSync(join(tmpdir(), 'spool-'));
  const records: Array<{actorId?: string}> = [];
  const prisma = {auditLog:{createMany:async ({data}:{data:Array<{actorId:string}>})=>{records.push(...data);}}} as unknown as PrismaService;
  await assert.rejects(()=>lastValueFrom(new RequestContextInterceptor(prisma).intercept(httpContext, refusingHandler)), /rolled back/);
  assert.equal(records.length,1);
  assert.equal(records[0].actorId,'doctor');
});

test('une base indisponible après 3 essais ne fait pas perdre le refus : il est gardé sur le serveur puis réécrit une seule fois', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'spool-'));
  process.env.AULIA_AUDIT_SPOOL_DIR = dir;
  let down = true;
  const stored = new Map<string, unknown>();
  const prisma = {auditLog:{createMany:async ({data}:{data:Array<{id:string}>})=>{
    if (down) throw new Error('db down');
    for (const row of data) if (!stored.has(row.id)) stored.set(row.id, row);
  }}} as unknown as PrismaService;
  const interceptor = new RequestContextInterceptor(prisma);
  await assert.rejects(()=>lastValueFrom(interceptor.intercept(httpContext, refusingHandler)), /rolled back/);
  assert.equal(stored.size, 0);
  assert.equal(pendingAuditCount(), 1);
  assert.match(readFileSync(join(dir, 'pending.jsonl'), 'utf8'), /"actorId":"doctor"/);

  down = false;
  await interceptor.onApplicationBootstrap();
  assert.equal(stored.size, 1);
  assert.equal(pendingAuditCount(), 0);
  assert.equal(existsSync(join(dir, 'replaying.jsonl')), false);
  await interceptor.onApplicationBootstrap();
  assert.equal(stored.size, 1);
});
