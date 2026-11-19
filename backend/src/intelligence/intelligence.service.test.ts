import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClinicContextService } from '../core/clinic-context.service';
import { IntelligenceService } from './intelligence.service';

const activeUser = (clinicId: string | null) => ({ clinicId, status: 'ACTIVE', deletedAt: null });

function build(options: { actorClinic?: string | null; consultation?: unknown; patients?: unknown[] }) {
  const calls: { consultationWhere?: any; patientArgs?: any; agentRequests: any[] } = { agentRequests: [] };
  const prisma = {
    user: { findUnique: async () => (options.actorClinic === undefined ? null : activeUser(options.actorClinic)) },
    consultation: {
      findFirst: async (args: any) => {
        calls.consultationWhere = args.where;
        return options.consultation ?? null;
      },
    },
    patient: {
      findMany: async (args: any) => {
        calls.patientArgs = args;
        return options.patients ?? [];
      },
    },
  };
  const agent = {
    execute: async (request: any) => {
      calls.agentRequests.push(request);
      return { suggestions: [], disclaimer: 'test' };
    },
  };
  const service = new IntelligenceService(prisma as never, agent as never, new ClinicContextService(prisma as never));
  return { service, calls };
}

test('analysis scopes the consultation to the authenticated clinic and never calls the agent for a foreign record', async () => {
  const { service, calls } = build({ actorClinic: 'clinic-a', consultation: null });
  await assert.rejects(
    () => service.analyseConsultation('consultation-of-clinic-b', 'fièvre et toux', { userId: 'doctor-a' }),
    NotFoundException,
  );
  assert.deepEqual(calls.consultationWhere, {
    id: 'consultation-of-clinic-b',
    deletedAt: null,
    clinicId: 'clinic-a',
    patient: { clinicId: 'clinic-a' },
  });
  assert.equal(calls.agentRequests.length, 0);
});

test('analysis refuses an unauthenticated or detached actor before reading any consultation', async () => {
  const unauthenticated = build({ actorClinic: 'clinic-a' });
  await assert.rejects(() => unauthenticated.service.analyseConsultation('c1', 'texte', undefined), ForbiddenException);
  assert.equal(unauthenticated.calls.consultationWhere, undefined);

  const detached = build({ actorClinic: null });
  await assert.rejects(() => detached.service.analyseConsultation('c1', 'texte', { userId: 'u1' }), ForbiddenException);
  assert.equal(detached.calls.consultationWhere, undefined);
});

test('analysis of an own-clinic consultation sends that clinic as tenant', async () => {
  const { service, calls } = build({
    actorClinic: 'clinic-a',
    consultation: {
      id: 'c1',
      patientId: 'p1',
      updatedAt: new Date('2026-11-11T10:00:00Z'),
      patient: { clinicId: 'clinic-a', dateOfBirth: null, gender: 'FEMALE' },
    },
  });
  const result = await service.analyseConsultation('c1', 'fièvre depuis 2 jour', { userId: 'doctor-a' });
  assert.equal(calls.agentRequests.length, 1);
  assert.equal(calls.agentRequests[0].tenantId, 'clinic-a');
  assert.equal(result.persisted, false);
});

test('duplicate search is limited to the actor clinic and returns identity fields only', async () => {
  const { service, calls } = build({
    actorClinic: 'clinic-a',
    patients: [{ id: 'p1', firstName: 'Alice', lastName: 'Core', email: 'a@x.cd', phone: '+243810000000' }],
  });
  const result = await service.findDuplicateCandidates({ firstName: 'Alice' }, { userId: 'reception-a' });
  assert.equal(calls.patientArgs.where.clinicId, 'clinic-a');
  assert.equal(calls.patientArgs.where.deletedAt, null);
  assert.deepEqual(Object.keys(calls.patientArgs.select).sort(), ['dateOfBirth', 'email', 'firstName', 'gender', 'id', 'lastName', 'phone']);
  assert.equal(result.length, 1);
});

test('duplicate search refuses an actor without clinic', async () => {
  const { service, calls } = build({ actorClinic: null });
  await assert.rejects(() => service.findDuplicateCandidates({ firstName: 'Alice' }, { userId: 'u1' }), ForbiddenException);
  assert.equal(calls.patientArgs, undefined);
});
