import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientWorkflowStatus } from '@prisma/client';

import { PatientWorkflowService } from './patient-workflow.service';

test('workflow transitions reject a regressive hospitalized patient', async () => {
  const service = new PatientWorkflowService();

  const tx = {
    $executeRaw: async () => undefined,
    patient: {
      findFirst: async () => ({
        workflowStatus: PatientWorkflowStatus.HOSPITALISE,
      }),
      updateMany: async () => ({ count: 1 }),
    },
  };

  await assert.rejects(
    () => service.transition(
      tx as any,
      'patient-a',
      PatientWorkflowStatus.EN_ATTENTE_MEDECIN,
      'clinic-a',
    ),
    /Transition patient interdite/,
  );
});

test('workflow permits the explicit consultation to payment hand-off', async () => {
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

  assert.equal(result, PatientWorkflowStatus.EN_ATTENTE_DE_PAIEMENT);

  assert.equal(updated, true);
});

test('a completed patient cannot be reopened through the workflow', async () => {
  const service = new PatientWorkflowService();

  let updatedStatus: PatientWorkflowStatus | undefined;

  await assert.rejects(
    () => service.transition({
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
    ),
    /Transition patient interdite/,
  );

  assert.equal(updatedStatus, undefined);
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

test('certified death closes a patient through its explicit exceptional transition', async () => {
  const service = new PatientWorkflowService();
  let requestedStatus: PatientWorkflowStatus | undefined;

  const result = await service.completeForCertifiedDeath(
    {
      $executeRaw: async () => undefined,
      patient: {
        findFirst: async () => ({ workflowStatus: PatientWorkflowStatus.HOSPITALISE }),
        updateMany: async (query: { data: { workflowStatus: PatientWorkflowStatus } }) => {
          requestedStatus = query.data.workflowStatus;
          return { count: 1 };
        },
      },
    } as any,
    'patient-a',
    'clinic-a',
  );

  assert.equal(result, PatientWorkflowStatus.TERMINE);
  assert.equal(requestedStatus, PatientWorkflowStatus.TERMINE);
});
