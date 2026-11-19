import assert from 'node:assert/strict';
import test from 'node:test';
import { firstValueFrom, of } from 'rxjs';
import { AuditReadInterceptor } from './audit-read.interceptor';
import { runWithRequestContext } from '../core/request-context';
const execution = (id?: string) => ({
  getHandler: () => () => undefined,
  switchToHttp: () => ({ getRequest: () => ({ params: id ? { id } : {} }) }),
}) as never;
const reflector = { get: () => ({ entity: 'Patient', param: 'id' }) } as never;
test('audited patient reads fail closed without actor context', async () => {
  const interceptor = new AuditReadInterceptor(reflector, { recordRead: async () => undefined } as never);
  await assert.rejects(firstValueFrom(interceptor.intercept(execution('patient-a'), { handle: () => of({ id: 'patient-a' }) })), /lecture refusée/);
});
test('audited patient reads fail closed when the ledger is unavailable', async () => {
  const interceptor = new AuditReadInterceptor(reflector, { recordRead: async () => { throw new Error('ledger unavailable'); } } as never);
  await runWithRequestContext({ userId: 'doctor-a', clinicId: 'clinic-a' }, async () => {
    await assert.rejects(firstValueFrom(interceptor.intercept(execution('patient-a'), { handle: () => of({ id: 'patient-a' }) })), /ledger unavailable/);
  });
});
test('audited patient reads only return after recording actor and patient', async () => {
  let recorded: unknown;
  const interceptor = new AuditReadInterceptor(reflector, { recordRead: async (...args: unknown[]) => { recorded = args; } } as never);
  const actor = { userId: 'doctor-a', clinicId: 'clinic-a' };
  await runWithRequestContext(actor, async () => {
    assert.deepEqual(await firstValueFrom(interceptor.intercept(execution('patient-a'), { handle: () => of({ id: 'patient-a' }) })), { id: 'patient-a' });
  });
  assert.deepEqual(recorded, [actor, 'Patient', 'patient-a']);
});

for (const [entity, param] of [['Patient', 'id'], ['Patient', 'patientId'], ['Consultation', 'id'], ['Hospitalization', 'id'], ['CareEpisode', 'id']]) {
  test(`audit records the configured ${entity}/${param} target`, async () => {
    let recorded: unknown;
    const interceptor = new AuditReadInterceptor({ get: () => ({ entity, param }) } as never, { recordRead: async (...args: unknown[]) => { recorded = args; } } as never);
    const actor = { userId: 'actor-a', clinicId: 'clinic-a' };
    const context = { getHandler: () => () => undefined, switchToHttp: () => ({ getRequest: () => ({ params: { [param]: 'record-a' } }) }) } as never;
    await runWithRequestContext(actor, async () => {
      assert.deepEqual(await firstValueFrom(interceptor.intercept(context, { handle: () => of({ id: 'record-a' }) })), { id: 'record-a' });
    });
    assert.deepEqual(recorded, [actor, entity, 'record-a']);
  });
}
test('audited reads refuse a missing record parameter even with an authenticated actor', async () => {
  const interceptor = new AuditReadInterceptor(reflector, { recordRead: async () => undefined } as never);
  await runWithRequestContext({ userId: 'actor-a', clinicId: 'clinic-a' }, async () => {
    await assert.rejects(firstValueFrom(interceptor.intercept(execution(), { handle: () => of({ id: 'record-a' }) })), /lecture refusée/);
  });
});
