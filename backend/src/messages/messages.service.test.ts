import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';

const actor = { clinicId: 'clinic-a', primaryRole: 'PHYSICIAN', status: 'ACTIVE', deletedAt: null };
const patient = { clinicId: 'clinic-a', primaryRole: 'PATIENT', status: 'ACTIVE', deletedAt: null };
const imaging = {
  id: 'imaging-1', clinicId: 'clinic-a', requestedById: 'doctor-1', patientId: 'patient-1',
  modality: 'CT', bodyPart: 'Thorax', examSubType: null, status: 'VERIFIED', createdAt: new Date(),
  patient: { id: 'patient-1', firstName: 'Aline', lastName: 'Test', portalUserId: 'patient-user-1' },
  requestedBy: { id: 'doctor-1', displayName: 'Dr Test' }, imagingCatalogue: { name: 'Scanner thoracique' },
  report: {
    verified: true, findings: 'Constatations fictives', impression: 'Conclusion fictive', recommendations: null,
    dicomStudyInstanceUid: 'urn:oid:1.2.3', imagePaths: [], interpretedById: 'radio-1', radiologistId: 'radio-1', deletedAt: null,
  },
};

function fixture(recipient = patient) {
  const created: any[] = [];
  const tx = {
    chatMessage: { create: async ({ data }: any) => {
      const message = {
        ...data, id: 'message-1', status: 'SENT', createdAt: new Date(), deliveredAt: null, readAt: null,
        attachmentOriginalName: null, attachmentMimeType: null, attachmentSizeBytes: null, audioDurationMs: null,
        sender: { id: data.senderId, displayName: 'Dr Test', username: 'doctor' },
        recipient: { id: data.recipientId, displayName: 'Patient Test', username: 'patient' },
      };
      created.push(message);
      return message;
    } },
    auditLog: { create: async () => ({}) },
  };
  const prisma = {
    user: { findUnique: async ({ where }: any) => where.id === 'doctor-1' ? actor : where.id === 'patient-user-1' ? patient : recipient },
    imagingRequest: { findFirst: async () => imaging, findMany: async () => [imaging] },
    $transaction: async (work: (client: typeof tx) => unknown) => work(tx),
  };
  const service = new MessagesService(
    prisma as never,
    { isDirectMessagingAllowed: async () => true } as never,
    { hasClinicPacsPreview: async () => false } as never,
  );
  return { service, created };
}

test('le médecin demandeur doit autoriser explicitement le partage au patient', async () => {
  const { service } = fixture();
  await assert.rejects(
    service.createImagingMessage('doctor-1', 'patient-user-1', 'imaging-1', '', false),
    (error) => error instanceof ForbiddenException && /autorisation explicite/.test(error.message),
  );
});

test('une imagerie vérifiée du bon patient peut être partagée avec traçabilité', async () => {
  const { service, created } = fixture();
  const result = await service.createImagingMessage('doctor-1', 'patient-user-1', 'imaging-1', 'À discuter', true);
  assert.equal(created[0].patientShareAuthorizedById, 'doctor-1');
  assert.equal(created[0].imagingRequestId, 'imaging-1');
  assert.equal(result.imaging?.dicomStudyInstanceUid, 'urn:oid:1.2.3');
  assert.equal(result.imaging?.verified, true);
});

test('une imagerie non vérifiée ne peut pas être envoyée au patient', async () => {
  const { service } = fixture();
  (service as any).prisma.imagingRequest.findFirst = async () => ({ ...imaging, status: 'COMPLETED', report: { ...imaging.report, verified: false } });
  await assert.rejects(
    service.createImagingMessage('doctor-1', 'patient-user-1', 'imaging-1', '', true),
    /compte rendu vérifié/,
  );
});

test('une imagerie ne peut pas être envoyée au compte d’un autre patient', async () => {
  const { service } = fixture({ ...patient });
  (service as any).prisma.imagingRequest.findFirst = async () => ({
    ...imaging,
    patient: { ...imaging.patient, portalUserId: 'another-patient' },
  });
  await assert.rejects(
    service.createImagingMessage('doctor-1', 'patient-user-1', 'imaging-1', '', true),
    /autre patient/,
  );
});

test('un professionnel étranger à l’examen ne peut pas le partager', async () => {
  const { service } = fixture();
  (service as any).prisma.imagingRequest.findFirst = async () => ({ ...imaging, requestedById: 'another-doctor' });
  await assert.rejects(
    service.createImagingMessage('doctor-1', 'patient-user-1', 'imaging-1', '', true),
    /Seuls le médecin demandeur et le radiologue/,
  );
});

test('le médecin demandeur et le radiologue peuvent négocier sans autorisation patient', async () => {
  const { service, created } = fixture({ ...actor, primaryRole: 'RADIOLOGIST' });
  const result = await service.createImagingMessage('doctor-1', 'radio-1', 'imaging-1', 'Avis demandé', false);
  assert.equal(created[0].recipientType, 'USER');
  assert.equal(created[0].patientShareAuthorizedById, null);
  assert.equal(result.imaging?.requestedByName, 'Dr Test');
});

test('le stockage privé et le chemin interne ne sont jamais exposés dans la conversation', async () => {
  const { service } = fixture();
  (service as any).prisma.chatMessage = {
    findMany: async () => [{
      ...imaging, id: 'message-1', senderId: 'doctor-1', recipientId: 'patient-user-1', recipientType: 'PATIENT',
      text: '', kind: 'IMAGING', status: 'SENT', createdAt: new Date(), deliveredAt: null, readAt: null,
      imagingRequestId: 'imaging-1', attachmentStorageKey: '/etc/passwd', attachmentOriginalName: null,
      attachmentMimeType: null, attachmentSizeBytes: null, audioDurationMs: null,
      sender: { id: 'doctor-1', displayName: 'Dr Test', username: 'doctor' },
      recipient: { id: 'patient-user-1', displayName: 'Patient Test', username: 'patient' },
    }],
  };
  const [message] = await service.findConversation('doctor-1', 'patient-user-1');
  assert.equal('attachmentStorageKey' in message, false);
  assert.equal('patientShareAuthorizedById' in message, false);
});

test('une imagerie sans autorisation patient est masquée même si une ligne est présente', async () => {
  const { service } = fixture();
  (service as any).prisma.chatMessage = {
    findMany: async () => [{
      id: 'message-forbidden', senderId: 'doctor-1', recipientId: 'patient-user-1', recipientType: 'PATIENT',
      text: '', kind: 'IMAGING', status: 'SENT', createdAt: new Date(), deliveredAt: null, readAt: null,
      imagingRequestId: 'imaging-1', patientShareAuthorizedAt: null,
      sender: { id: 'doctor-1', displayName: 'Dr Test', username: 'doctor' },
      recipient: { id: 'patient-user-1', displayName: 'Patient Test', username: 'patient' },
    }],
  };
  const rows = await service.findConversation('patient-user-1', 'doctor-1');
  assert.equal(rows.length, 0);
});
