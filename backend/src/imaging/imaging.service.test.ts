import assert from 'node:assert/strict';
import test from 'node:test';
import { ImagingService } from './imaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicContextService } from '../core/clinic-context.service';

test('imaging requests are read only through the patient clinic boundary', async () => {
  const queries: Array<Record<string, unknown>> = [];
  const service = new ImagingService(
    {
      imagingRequest: {
        findMany: async (query: Record<string, unknown>) => {
          queries.push(query);
          return [];
        },
      },
    } as unknown as PrismaService,
    {
      requireOperationalActor: async () => ({
        id: 'radiologist-a',
        clinicId: 'clinic-a',
        primaryRole: 'RADIOLOGIST',
      }),
    } as unknown as ClinicContextService,
  );

  await service.findAll('radiologist-a');

  assert.deepEqual(queries[0]?.where, {
    deletedAt: null,
    patient: { clinicId: 'clinic-a', deletedAt: null },
  });
});
