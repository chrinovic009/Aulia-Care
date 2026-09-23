import assert from 'node:assert/strict';
import test from 'node:test';
import { ImagingService } from './imaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicContextService } from '../core/clinic-context.service';

test('imaging catalogue is read and created only inside the radiologist clinic', async () => {
  const catalogueQueries: Array<Record<string, unknown>> = [];
  const service = new ImagingService(
    {
      imagingCatalogue: {
        findMany: async (query: Record<string, unknown>) => {
          catalogueQueries.push(query);
          return [];
        },
        findFirst: async (query: Record<string, unknown>) => {
          catalogueQueries.push(query);
          return null;
        },
        create: async (query: Record<string, unknown>) => {
          catalogueQueries.push(query);
          return query.data;
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

  await service.findCatalogue('radiologist-a');
  await service.createCatalogue(
    { code: 'XR-CHEST', name: 'Radiographie thoracique', modality: 'XRAY', price: 25000 },
    'radiologist-a',
  );

  assert.deepEqual(catalogueQueries[0]?.where, {
    clinicId: 'clinic-a',
    active: true,
    deletedAt: null,
  });
  assert.equal((catalogueQueries.at(-1)?.data as { clinicId?: string }).clinicId, 'clinic-a');
});

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
