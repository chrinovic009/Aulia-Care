import assert from 'node:assert/strict';
import test from 'node:test';
import { ImagingService } from './imaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicContextService } from '../core/clinic-context.service';
import { ConflictException } from '@nestjs/common';

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

test('a verified imaging report cannot be overwritten by the draft endpoint', async () => {
  let writes = 0;
  const tx = {
    $queryRaw: async () => [{ id: 'request-a' }],
    imagingReport: {
      findUnique: async () => ({ id: 'report-a', verified: true }),
      update: async () => { writes += 1; },
      create: async () => { writes += 1; },
    },
  };
  const service = new ImagingService(
    {
      imagingRequest: { findFirst: async () => ({ id: 'request-a' }) },
      invoice: { findFirst: async () => ({ status: 'PAID' }) },
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
    } as unknown as PrismaService,
    { requireOperationalActor: async () => ({ id: 'radiologist-a', clinicId: 'clinic-a', primaryRole: 'RADIOLOGIST' }) } as unknown as ClinicContextService,
  );

  await assert.rejects(
    service.saveReport('request-a', { findings: 'modified', impression: 'modified', verified: false }, 'radiologist-a'),
    ConflictException,
  );
  assert.equal(writes, 0);
});

test('imaging amendment retains the verified original and records clinic, author and next version', async () => {
  let amendment: Record<string, unknown> | undefined;
  let updatedVersion: unknown;
  const tx = {
    $queryRaw: async () => [{ id: 'request-a' }],
    imagingRequest: {
      findFirst: async (query: Record<string, unknown>) => {
        assert.deepEqual(query.where, {
          id: 'request-a', clinicId: 'clinic-a', deletedAt: null,
          patient: { clinicId: 'clinic-a', deletedAt: null },
        });
        return { report: { id: 'report-a', version: 2, verified: true } };
      },
    },
    imagingReport: {
      updateMany: async (query: Record<string, unknown>) => {
        updatedVersion = (query.data as Record<string, unknown>).version;
        return { count: 1 };
      },
    },
    imagingReportAmendment: {
      create: async (query: Record<string, unknown>) => {
        amendment = query.data as Record<string, unknown>;
        return amendment;
      },
    },
  };
  const service = new ImagingService(
    { $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaService,
    { requireOperationalActor: async () => ({ id: 'radiologist-a', clinicId: 'clinic-a', primaryRole: 'RADIOLOGIST' }) } as unknown as ClinicContextService,
  );

  await service.amendReport('request-a', {
    reason: 'Correction de transcription', findings: 'new findings', impression: 'new impression', expectedVersion: 2,
  }, 'radiologist-a');
  assert.equal(updatedVersion, 3);
  assert.deepEqual(amendment, {
    reportId: 'report-a', clinicId: 'clinic-a', authorId: 'radiologist-a', version: 3,
    reason: 'Correction de transcription', findings: 'new findings', impression: 'new impression', recommendations: null,
  });
});
