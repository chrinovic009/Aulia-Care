import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExamResults } from './consultation-integrity';
import { validateSpecialtyAssessment } from './specialty-validation';
import { Prisma } from '@prisma/client';
const c={id:'c',clinicId:'clinic',patientId:'patient'};
const db=(labs:unknown[],images:unknown[]=[])=>({labRequest:{findMany:async()=>labs},imagingRequest:{findMany:async()=>images}} as unknown as Prisma.TransactionClient);
test('empty browser exam list cannot conceal a pending persisted request',async()=>{
 await assert.rejects(assertExamResults(db([{items:[{labTestId:'a',status:'REQUESTED'}]}]),c,[]),/résultat final/);
});
test('completed lab items across multiple requests allow signature',async()=>{
 await assertExamResults(db([{items:[{labTestId:'a',status:'VERIFIED'}]},{items:[{labTestId:'b',status:'AVAILABLE'}]}]),c,[{category:'LABORATORY',catalogueItemId:'b'}]);
});
test('a repeated pending occurrence cannot use a prior completed result',async()=>{
 await assert.rejects(assertExamResults(db([{items:[{labTestId:'a',status:'VERIFIED'}]},{items:[{labTestId:'a',status:'REQUESTED'}]}]),c,[{category:'LABORATORY',catalogueItemId:'a'}]),/résultat final/);
});
test('unknown examination categories cannot bypass signature',async()=>{
 await assert.rejects(assertExamResults(db([]),c,[{category:'UNKNOWN',catalogueItemId:'a'}]),/résultat final/);
});
test('imaging requires both completion and a report',async()=>{
 await assert.rejects(assertExamResults(db([],[{status:'COMPLETED',report:null}]),c,[]),/résultat final/);
});
const assessment=(values:Record<string,string>,template='NEURO',specialty='Neurologie')=>({structured:{specialtyExam:{template,specialty,values}}});
test('Glasgow is an integer from 3 through 15',()=>{
 for(const value of ['2','16','abc','3.5']) assert.throws(()=>validateSpecialtyAssessment(assessment({glasgow:value}),'Neurologie'),/invalide/);
 for(const value of ['3','15']) validateSpecialtyAssessment(assessment({glasgow:value}),'Neurologie');
});
test('pediatric measurements must be positive numeric values',()=>{
 assert.throws(()=>validateSpecialtyAssessment(assessment({weightKg:'-1'},'PEDIATRIC','Pédiatrie générale'),'Pédiatrie générale'),/invalide/);
 validateSpecialtyAssessment(assessment({weightKg:'3,5'},'PEDIATRIC','Pédiatrie générale'),'Pédiatrie générale');
});
test('specialty and physician template must match',()=>{
 assert.throws(()=>validateSpecialtyAssessment(assessment({glasgow:'15'}),'Chirurgie générale'),/invalide/);
});
test('an explicitly empty specialist assessment cannot be signed',()=>{
 assert.throws(()=>validateSpecialtyAssessment(assessment({}),'Neurologie',true),/invalide/);
});
