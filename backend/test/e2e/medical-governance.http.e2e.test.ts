import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {PrismaClient} from '@prisma/client';import {Test} from '@nestjs/testing';import {ValidationPipe} from '@nestjs/common';import request from 'supertest';import {AppModule} from '../../src/app.module';import {AuthService} from '../../src/auth/auth.service';
const url=process.env.TEST_DATABASE_URL;
test('director authority and chained physician opinions remain clinic scoped', {skip:!url},async()=>{
 const p=new PrismaClient({datasources:{db:{url}}});const mod=await Test.createTestingModule({imports:[AppModule]}).compile();const app=mod.createNestApplication();app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true}));await app.init();const server=app.getHttpServer();const suffix=randomUUID();const clinic=await p.clinic.create({data:{name:'Gouvernance fictive '+suffix}});const other=await p.clinic.create({data:{name:'Autre clinique fictive '+suffix}});
 const make=(role:any,specialty:string,clinicId=clinic.id)=>p.user.create({data:{clinicId,primaryRole:role,email:randomUUID()+'@test.local',username:randomUUID(),firstName:'Fictif',lastName:role,displayName:role,passwordHash:'fixture-only',specialty}});
 try{
 await p.platformLayerConfiguration.createMany({data:[clinic,other].map(c=>({clinicId:c.id,enabledLayers:['CORE'],configuredAt:new Date(),configurationVersion:1}))});
 const [admin,general,surgeon,neuro,outsider]=await Promise.all([make('ADMIN',''),make('PHYSICIAN','Médecine générale'),make('PHYSICIAN','Chirurgie générale'),make('PHYSICIAN','Neurologie'),make('PHYSICIAN','Neurologie',other.id)]);
 const auth=app.get(AuthService);const cookies=async(u:any)=>['aulia_access_token='+(await auth.login(u)).accessToken];const [a,g,s,n,o]=await Promise.all([admin,general,surgeon,neuro,outsider].map(cookies));
 await request(server).put('/api/medical-governance/director').set('Cookie',g).send({userId:general.id,active:true}).expect(403);
 await request(server).put('/api/medical-governance/director').set('Cookie',a).send({userId:outsider.id,active:true}).expect(403);
 const granted=await request(server).put('/api/medical-governance/director').set('Cookie',a).send({userId:general.id,active:true});assert.equal(granted.status,200,JSON.stringify(granted.body));
 assert.equal((await p.user.findUnique({where:{id:general.id}}))?.primaryRole,'PHYSICIAN');
 await request(server).get('/api/medical-governance/policies').set('Cookie',g).expect(200);
 await request(server).get('/api/medical-governance/policies').set('Cookie',s).expect(403);
 for(const specialty of ['Médecine générale','Chirurgie générale','Neurologie'])await request(server).put('/api/medical-governance/policies').set('Cookie',g).send({specialty,required:['chiefComplaint'],rationale:'Référentiel fictif de test, aucune validation clinique réelle',expectedVersion:0,attestation:true}).expect(200);
 const patient=await p.patient.create({data:{clinicId:clinic.id,firstName:'Patient',lastName:'Fictif',dateOfBirth:new Date('1990-01-01'),gender:'OTHER',workflowStatus:'EN_ATTENTE_MEDECIN'}});
 let source=(await request(server).post('/api/consultations/open-for-patient').set('Cookie',g).send({patientId:patient.id,chiefComplaint:'Motif fictif'}).expect(201)).body;
 await request(server).post(`/api/consultations/${source.id}/clinical-sections`).set('Cookie',g).send({status:'FINALIZED',attestation:true,chiefComplaint:'',expectedVersion:source.version}).expect(400);
 source=(await request(server).post(`/api/consultations/${source.id}/clinical-sections`).set('Cookie',g).send({status:'FINALIZED',attestation:true,chiefComplaint:'Motif fictif',expectedVersion:source.version}).expect(201)).body;
 const signed=await p.consultation.findUnique({where:{id:source.id}});let sender=g;
 for(const [recipient,recipientCookies] of [[surgeon,s],[neuro,n]] as const){
 const payload={consultationId:source.id,recipientId:recipient.id,question:'Question clinique fictive',urgency:'ROUTINE',operationId:randomUUID()};
 const ref=(await request(server).post('/api/medical-governance/referrals').set('Cookie',sender).send(payload).expect(201)).body;
 assert.equal((await request(server).post('/api/medical-governance/referrals').set('Cookie',sender).send(payload).expect(201)).body.id,ref.id);
 await request(server).post(`/api/medical-governance/referrals/${ref.id}/decision`).set('Cookie',o).send({action:'ACCEPT',version:ref.version}).expect(404);
 await request(server).post(`/api/medical-governance/referrals/${ref.id}/decision`).set('Cookie',sender).send({action:'ACCEPT',version:ref.version}).expect(403);
 await request(server).get(`/api/medical-governance/referrals/${ref.id}/source`).set('Cookie',recipientCookies).expect(200);
 const accepted=(await request(server).post(`/api/medical-governance/referrals/${ref.id}/decision`).set('Cookie',recipientCookies).send({action:'ACCEPT',version:ref.version}).expect(201)).body;
 const encounter=(await request(server).post(`/api/medical-governance/referrals/${ref.id}/open`).set('Cookie',recipientCookies).send({}).expect(201)).body;assert.notEqual(encounter.id,source.id);assert.equal(encounter.providerId,recipient.id);
 const current=await p.consultationReferral.findUnique({where:{id:ref.id}});assert.ok(current);
 await request(server).post(`/api/medical-governance/referrals/${ref.id}/decision`).set('Cookie',recipientCookies).send({action:'COMPLETE',version:current.version,response:'Réponse fictive'}).expect(400);
 source=(await request(server).post(`/api/consultations/${encounter.id}/clinical-sections`).set('Cookie',recipientCookies).send({status:'FINALIZED',attestation:true,chiefComplaint:'Examen fictif',expectedVersion:encounter.version}).expect(201)).body;
 await request(server).post(`/api/medical-governance/referrals/${ref.id}/decision`).set('Cookie',recipientCookies).send({action:'COMPLETE',version:current.version,response:'Réponse fictive'}).expect(201);
 const rows=(await request(server).get('/api/medical-governance/referrals').set('Cookie',sender).expect(200)).body;assert.equal(rows.find((r:any)=>r.id===ref.id)?.response,'Réponse fictive');sender=recipientCookies;
 }
 assert.deepEqual(await p.consultation.findUnique({where:{id:signed?.id || ''}}),signed);
 await request(server).put('/api/medical-governance/director').set('Cookie',a).send({userId:general.id,active:false}).expect(200);
 await request(server).get('/api/medical-governance/policies').set('Cookie',g).expect(403);
 }finally{await app.close();await p.consultationReferral.deleteMany({where:{clinicId:clinic.id}});await p.consultationPolicy.deleteMany({where:{clinicId:clinic.id}});await p.$disconnect();}
});
