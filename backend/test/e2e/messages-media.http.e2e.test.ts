import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuliaLayer, PrismaClient, RoleSlug } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00, 0x00, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const binaryParser = (response: NodeJS.ReadableStream, callback: (error: Error | null, body?: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on('data', chunk => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', error => callback(error));
};

test('HTTP messagerie : photo, vocal, PACS et autorisations patient', { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const suffix = randomUUID().slice(0, 12);
  const mediaRoot = await mkdtemp(path.join(tmpdir(), 'aulia-message-e2e-'));
  const pacsRoot = await mkdtemp(path.join(tmpdir(), 'aulia-pacs-e2e-'));
  const previewRoot = await mkdtemp(path.join(tmpdir(), 'aulia-preview-e2e-'));
  await writeFile(path.join(pacsRoot, 'study.png'), png);
  process.env.MESSAGE_MEDIA_DIR = mediaRoot;
  process.env.PACS_PREVIEW_ROOT = pacsRoot;
  process.env.IMAGING_PREVIEW_UPLOAD_DIR = previewRoot;
  delete process.env.PACS_PREVIEW_URL_TEMPLATE;
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET ??= 'messages_media_test_access_secret';
  process.env.JWT_REFRESH_SECRET ??= 'messages_media_test_refresh_secret';
  process.env.CORS_ORIGIN ??= 'http://localhost:5173';

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let app: INestApplication | undefined;
  try {
    const clinic = await prisma.clinic.create({ data: { name: `Messagerie fictive ${suffix}` } });
    await prisma.platformLayerConfiguration.create({
      data: { clinicId: clinic.id, enabledLayers: [AuliaLayer.CORE], configuredAt: new Date(), configurationVersion: 1 },
    });
    const makeUser = (role: RoleSlug, label: string) => prisma.user.create({
      data: {
        clinicId: clinic.id,
        email: `${label}-${suffix}@e2e.local`,
        username: `${label}-${suffix}`,
        displayName: label,
        firstName: label,
        lastName: 'Fictif',
        passwordHash: 'fixture-only',
        primaryRole: role,
      },
    });
    const [doctor, radiologist, patientUser, otherPatientUser, outsider] = await Promise.all([
      makeUser(RoleSlug.PHYSICIAN, 'doctor'),
      makeUser(RoleSlug.RADIOLOGIST, 'radio'),
      makeUser(RoleSlug.PATIENT, 'patient'),
      makeUser(RoleSlug.PATIENT, 'other-patient'),
      makeUser(RoleSlug.PATIENT, 'outsider'),
    ]);
    const makePatient = (firstName: string, portalUserId: string) => prisma.patient.create({
      data: { clinicId: clinic.id, firstName, lastName: 'Fictif', dateOfBirth: new Date('1990-01-01'), gender: 'OTHER', portalUserId },
    });
    const [patient, otherPatient] = await Promise.all([
      makePatient('Aline', patientUser.id),
      makePatient('Béatrice', otherPatientUser.id),
    ]);
    for (const item of [patient, otherPatient]) {
      const appointment = await prisma.appointment.create({
        data: { clinicId: clinic.id, patientId: item.id, requestedById: doctor.id, scheduledAt: new Date() },
      });
      await prisma.consultation.create({
        data: { clinicId: clinic.id, patientId: item.id, appointmentId: appointment.id, providerId: doctor.id, chiefComplaint: 'Motif fictif' },
      });
    }
    const makeImaging = (patientId: string) => prisma.imagingRequest.create({
      data: {
        clinicId: clinic.id,
        patientId,
        requestedById: doctor.id,
        modality: 'XRAY',
        bodyPart: 'Thorax',
        status: 'VERIFIED',
        report: {
          create: {
            interpretedById: radiologist.id,
            radiologistId: radiologist.id,
            findings: 'Constatations fictives',
            impression: 'Conclusion fictive',
            verified: true,
            verifiedAt: new Date(),
            dicomStudyInstanceUid: `urn:oid:1.2.3.${suffix}`,
            imagePaths: ['study.png'],
          },
        },
      },
      include: { report: true },
    });
    const [study, otherStudy] = await Promise.all([makeImaging(patient.id), makeImaging(otherPatient.id)]);
    assert.ok(study.report && otherStudy.report);
    const draftStudy = await prisma.imagingRequest.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        requestedById: doctor.id,
        modality: 'XRAY',
        bodyPart: 'Thorax',
        status: 'COMPLETED',
        report: { create: { interpretedById: radiologist.id, findings: 'Brouillon fictif', impression: 'À confirmer', verified: false } },
      },
      include: { report: true },
    });
    await prisma.invoice.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        issuedById: doctor.id,
        type: 'RADIOLOGY',
        status: 'PAID',
        totalAmount: 100,
        balanceDue: 0,
        remarks: `ImagingRequest:${draftStudy.id}`,
      },
    });

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    const server = app.getHttpServer();
    const auth = app.get(AuthService);
    const cookiesFor = async (user: { id: string }) => [`aulia_access_token=${(await auth.login(user as never)).accessToken}`];
    const [doctorCookies, radioCookies, patientCookies, otherPatientCookies, outsiderCookies] = await Promise.all([
      cookiesFor(doctor), cookiesFor(radiologist), cookiesFor(patientUser), cookiesFor(otherPatientUser), cookiesFor(outsider),
    ]);

    const photo = await request(server).post(`/api/messages/media/${patientUser.id}`)
      .set('Cookie', doctorCookies)
      .field('kind', 'PHOTO')
      .field('caption', 'Photo fictive')
      .attach('file', jpeg, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);
    assert.equal(photo.body.kind, 'PHOTO');
    assert.equal(photo.body.attachmentStorageKey, undefined);
    const photoContent = await request(server).get(`/api/messages/${photo.body.id}/attachment`)
      .set('Cookie', patientCookies).buffer().parse(binaryParser).expect('Content-Type', /image\/jpeg/);
    assert.equal(photoContent.status, 200, photoContent.body.toString());
    assert.deepEqual(photoContent.body, jpeg);
    await request(server).get(`/api/messages/${photo.body.id}/attachment`).set('Cookie', outsiderCookies).expect(404);

    const voice = await request(server).post(`/api/messages/media/${patientUser.id}`)
      .set('Cookie', doctorCookies)
      .field('kind', 'VOICE').field('durationMs', '1250')
      .attach('file', webm, { filename: 'voice.webm', contentType: 'audio/webm' })
      .expect(201);
    assert.equal(voice.body.audioDurationMs, 1250);
    await request(server).get(`/api/messages/${voice.body.id}/attachment`).set('Cookie', patientCookies).expect(200).expect('Content-Type', /audio\/webm/);

    const available = await request(server).get(`/api/messages/imaging/available/${patientUser.id}`).set('Cookie', doctorCookies).expect(200);
    assert.deepEqual(available.body.map((item: { id: string }) => item.id), [study.id]);
    await request(server).post(`/api/messages/imaging/${patientUser.id}`).set('Cookie', doctorCookies)
      .send({ imagingRequestId: study.id, authorizePatient: false }).expect(403);
    await request(server).post(`/api/messages/imaging/${otherPatientUser.id}`).set('Cookie', doctorCookies)
      .send({ imagingRequestId: study.id, authorizePatient: true }).expect(403);
    await request(server).post(`/api/messages/imaging/${patientUser.id}`).set('Cookie', patientCookies)
      .send({ imagingRequestId: study.id, authorizePatient: true }).expect(403);

    const shared = await request(server).post(`/api/messages/imaging/${patientUser.id}`).set('Cookie', doctorCookies)
      .send({ imagingRequestId: study.id, caption: 'Examen vérifié fictif', authorizePatient: true }).expect(201);
    assert.equal(shared.body.imaging.verified, true);
    assert.equal(shared.body.imaging.hasPreview, true);
    assert.equal(shared.body.patientShareAuthorizedById, undefined);
    const pacsContent = await request(server).get(`/api/messages/${shared.body.id}/attachment`)
      .set('Cookie', patientCookies).buffer().parse(binaryParser).expect(200).expect('Content-Type', /image\/png/);
    assert.deepEqual(pacsContent.body, png);
    await request(server).get(`/api/messages/${shared.body.id}/attachment`).set('Cookie', otherPatientCookies).expect(404);

    const professional = await request(server).post(`/api/messages/imaging/${radiologist.id}`).set('Cookie', doctorCookies)
      .send({ imagingRequestId: study.id, caption: 'Avis radiologique fictif', authorizePatient: false }).expect(201);
    assert.equal(professional.body.recipientType, 'USER');
    const radioConversation = await request(server).get(`/api/messages/with/${doctor.id}`).set('Cookie', radioCookies).expect(200);
    assert.equal(radioConversation.body.find((item: { id: string }) => item.id === professional.body.id)?.imaging.impression, 'Conclusion fictive');

    const patientConversation = await request(server).get(`/api/messages/with/${doctor.id}`).set('Cookie', patientCookies).expect(200);
    assert.equal(patientConversation.body.find((item: { id: string }) => item.id === shared.body.id)?.imaging.dicomStudyInstanceUid, `urn:oid:1.2.3.${suffix}`);
    assert.equal(patientConversation.body.some((item: { attachmentStorageKey?: string }) => item.attachmentStorageKey), false);

    await request(server).post(`/api/imaging/${draftStudy.id}/report/previews`).set('Cookie', doctorCookies)
      .attach('file', png, { filename: 'preview.png', contentType: 'image/png' }).expect(403);
    const uploaded = await request(server).post(`/api/imaging/${draftStudy.id}/report/previews`).set('Cookie', radioCookies)
      .attach('file', png, { filename: 'preview.png', contentType: 'image/png' }).expect(201);
    assert.equal(uploaded.body.imagePaths.length, 1);
    assert.match(uploaded.body.imagePaths[0], /^[0-9a-f-]+\.png$/);
    const reportPreview = await request(server).get(`/api/imaging/${draftStudy.id}/report/previews/0`)
      .set('Cookie', doctorCookies).buffer().parse(binaryParser).expect(200).expect('Content-Type', /image\/png/);
    assert.deepEqual(reportPreview.body, png);
    await request(server).get(`/api/imaging/${draftStudy.id}/report/previews/0`).set('Cookie', patientCookies).expect(403);
    await request(server).post(`/api/imaging/${draftStudy.id}/report`).set('Cookie', radioCookies)
      .send({ findings: 'Constatations définitives', impression: 'Conclusion définitive', verified: true }).expect(201);
    await request(server).post(`/api/imaging/${draftStudy.id}/report/previews`).set('Cookie', radioCookies)
      .attach('file', png, { filename: 'late.png', contentType: 'image/png' }).expect(409);
  } finally {
    if (app) await app.close();
    await prisma.$disconnect();
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(pacsRoot, { recursive: true, force: true });
    await rm(previewRoot, { recursive: true, force: true });
    delete process.env.MESSAGE_MEDIA_DIR;
    delete process.env.PACS_PREVIEW_ROOT;
    delete process.env.IMAGING_PREVIEW_UPLOAD_DIR;
  }
});
