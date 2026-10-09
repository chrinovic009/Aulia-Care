import assert from 'node:assert/strict';
import test from 'node:test';
import { LaboratoryService } from './laboratory.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ClinicContextService } from '../core/clinic-context.service';

test('laboratory list includes a paid REQUESTED order only within the actor clinic', async () => {
  let requestQuery: Record<string, unknown> | undefined;
  const service = new LaboratoryService(
    {
      invoice: { findMany: async () => [{ id: 'invoice-a', remarks: 'LabRequest:request-a' }] },
      labRequest: { findMany: async (query: Record<string, unknown>) => {
        requestQuery = query;
        return [{ id: 'request-a', status: 'REQUESTED' }];
      } },
    } as unknown as PrismaService,
    {} as NotificationsGateway,
    { requireOperationalActor: async () => ({ id: 'lab-a', clinicId: 'clinic-a' }) } as unknown as ClinicContextService,
  );

  const requests = await service.findAll('lab-a');
  assert.equal(requests[0].status, 'REQUESTED');
  const where = requestQuery?.where as Record<string, unknown>;
  assert.equal(where.clinicId, 'clinic-a');
  assert.deepEqual(where.OR, [
    { externalReference: null },
    { externalReference: { in: ['invoice-a'] } },
    { id: { in: ['request-a'] } },
  ]);
});
