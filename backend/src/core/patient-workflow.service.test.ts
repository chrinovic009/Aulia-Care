import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientWorkflowStatus } from '@prisma/client';

import { PatientWorkflowService } from './patient-workflow.service';

test('workflow transitions cannot regress a hospitalized patient', async () => {
  let updatedStatus: PatientWorkflowStatus | undefined;

  const service = new PatientWorkflowService();

  const tx = {
    $executeRaw: async () => undefined,
    patient: {
      findFirst: async () => ({
        workflowStatus: PatientWorkflowStatus.HOSPITALISE,
      }),
      updateMany: async (query: {
        data: {
          workflowStatus: PatientWorkflowStatus;
        };
      }) => {
        updatedStatus = query.data.workflowStatus;

        return {
          count: 1,
        };
      },
    },
  };

  const result = await service.transition(
    tx as any,
    'patient-a',
    PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
    'clinic-a',
  );

  assert.equal(
    result,
    PatientWorkflowStatus.HOSPITALISE,
  );

  assert.equal(
    updatedStatus,
    undefined,
  );
});

test('workflow transitions preserve consultation against regressive states', async () => {
  const service = new PatientWorkflowService();

  let updated = false;

  const result = await service.transition(
    {
      $executeRaw: async () => undefined,
      patient: {
        findFirst: async () => ({
          workflowStatus:
            PatientWorkflowStatus.EN_CONSULTATION,
        }),
        updateMany: async () => {
          updated = true;

          return {
            count: 1,
          };
        },
      },
    } as any,
    'patient-a',
    PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT,
    'clinic-a',
  );

  assert.equal(
    result,
    PatientWorkflowStatus.EN_CONSULTATION,
  );

  assert.equal(
    updated,
    false,
  );
});

test('a completed patient can start a new workflow', async () => {
  const service = new PatientWorkflowService();

  let updatedStatus: PatientWorkflowStatus | undefined;

  const result = await service.transition(
    {
      $executeRaw: async () => undefined,
      patient: {
        findFirst: async () => ({
          workflowStatus:
            PatientWorkflowStatus.TERMINE,
        }),
        updateMany: async (query: {
          data: {
            workflowStatus: PatientWorkflowStatus;
          };
        }) => {
          updatedStatus =
            query.data.workflowStatus;

          return {
            count: 1,
          };
        },
      },
    } as any,
    'patient-a',
    PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
    'clinic-a',
  );

  assert.equal(
    result,
    PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
  );

  assert.equal(
    updatedStatus,
    PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
  );
});

test('workflow transitions require an explicit clinic id', async () => {
  const service = new PatientWorkflowService();

  await assert.rejects(
    () =>
      service.transition(
        {
          $executeRaw: async () => undefined,
          patient: {
            findFirst: async () => ({
              workflowStatus:
                PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
            }),
            updateMany: async () => ({
              count: 1,
            }),
          },
        } as any,
        'patient-a',
        PatientWorkflowStatus.EN_CONSULTATION,
        '' as string,
      ),
    /explicit clinicId/,
  );
});