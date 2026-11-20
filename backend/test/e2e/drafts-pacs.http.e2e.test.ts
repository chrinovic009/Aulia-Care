import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { PacsConfigService } from '../../src/pacs/pacs-config.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('physician drafts round trip and PACS configuration stays private per clinic', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();
  try {
    const clinic = await prisma.clinic.create({ data: { name: `Draft fixture ${randomUUID()}` } });
    const other = await prisma.clinic.create({ data: { name: `Other fixture ${randomUUID()}` } });
    await prisma.platformLayerConfiguration.create({ data: { clinicId: clinic.id, enabledLayers: ['CORE'], configuredAt: new Date(), configurationVersion: 1 } });
    const make = (role: 'DEV' | 'PHYSICIAN', specialty: string) => prisma.user.create({ data: {
      clinicId: role === 'DEV' ? null : clinic.id, primaryRole: role, specialty,
      email: `${randomUUID()}@test.local`, username: randomUUID(), firstName: 'Fictif', lastName: specialty || role, displayName: specialty || role, passwordHash: 'fixture-only',
    } });
    const [dev, general, specialist] = await Promise.all([make('DEV', ''), make('PHYSICIAN', 'Médecine générale'), make('PHYSICIAN', 'Neurologie')]);
    const auth = app.get(AuthService);
    const cookie = async (user: { id: string }) => [`aulia_access_token=${(await auth.login(user as never)).accessToken}`];
    const [d, g, s] = await Promise.all([dev, general, specialist].map(cookie));
    const server = app.getHttpServer();
    const endpoint = `/api/platform/provisioning/clinics/${clinic.id}/pacs`;
    await request(server).put(endpoint).set('Cookie', g).send({ enabled: true, previewUrlTemplate: 'https://pacs.local/{studyUid}' }).expect(403);
    const configured = await request(server).put(endpoint).set('Cookie', d).send({ enabled: true, previewUrlTemplate: 'https://pacs.local/{studyUid}', token: 'synthetic-clinic-token' }).expect(200);
    assert.equal(configured.body.hasToken, true);
    assert.equal(JSON.stringify(configured.body).includes('synthetic-clinic-token'), false);
    assert.equal(JSON.stringify((await request(server).get(endpoint).set('Cookie', d).expect(200)).body).includes('tokenCiphertext'), false);
    assert.equal((await app.get(PacsConfigService).resolve(clinic.id))?.token, 'synthetic-clinic-token');
    assert.equal(await app.get(PacsConfigService).resolve(other.id), null);
    await request(server).put(endpoint).set('Cookie', d).send({ enabled: true, previewUrlTemplate: 'https://changed.local/{studyUid}' }).expect(400);
    await request(server).put(endpoint).set('Cookie', d).send({ enabled: true, previewUrlTemplate: 'https://pacs.local/{studyUid}' }).expect(200);
    assert.equal((await app.get(PacsConfigService).resolve(clinic.id))?.token, 'synthetic-clinic-token');
    await request(server).put(endpoint).set('Cookie', d).send({ enabled: false, previewUrlTemplate: '', clearToken: true }).expect(200);
    assert.equal(await app.get(PacsConfigService).resolve(clinic.id), null);
    assert.equal((await prisma.clinicPacsConfiguration.findUnique({ where: { clinicId: clinic.id } }))?.tokenCiphertext, null);
    for (const [doctor, cookies, specialtyExam] of [[general, g, null], [specialist, s, { template: 'NEURO', specialty: 'Neurologie', values: { motor: 'Observation fictive' } }]] as const) {
      const patient = await prisma.patient.create({ data: { clinicId: clinic.id, firstName: 'Patient', lastName: 'Fictif', gender: 'OTHER', dateOfBirth: new Date('1990-01-01'), workflowStatus: 'EN_ATTENTE_MEDECIN' } });
      const opened = (await request(server).post('/api/consultations/open-for-patient').set('Cookie', cookies).send({ patientId: patient.id, chiefComplaint: 'Plainte fictive' }).expect(201)).body;
      const input = { status: 'DRAFT', chiefComplaint: 'Plainte conservée', expectedVersion: opened.version,
        diagnosis: { principal: 'Diagnostic fictif', hypotheses: ['Hypothèse fictive'] },
        consultationModule: { structured: { ...(specialtyExam ? { specialtyExam } : {}) }, chiefComplaint: 'Plainte conservée' },
      };
      const saved = (await request(server).post(`/api/consultations/${opened.id}/clinical-sections`).set('Cookie', cookies).send(input).expect(201)).body;
      const detail = (await request(server).get(`/api/consultations/${opened.id}/draft-detail`).set('Cookie', cookies).expect(200)).body;
      assert.equal(detail.providerId, doctor.id);
      assert.equal(detail.version, saved.version);
      assert.equal(detail.canWrite, true);
      const summary = JSON.parse(detail.clinicalSummary);
      assert.equal(summary.diagnosis.principal, 'Diagnostic fictif');
      assert.deepEqual(summary.consultationModule.structured.specialtyExam ?? null, specialtyExam);
      await request(server).post(`/api/consultations/${opened.id}/clinical-sections`).set('Cookie', cookies).send(input).expect(409);
      assert.equal((await prisma.consultation.findUnique({ where: { id: opened.id } }))?.chiefComplaint, 'Plainte conservée');
    }
  } finally { await app.close(); await prisma.$disconnect(); }
});