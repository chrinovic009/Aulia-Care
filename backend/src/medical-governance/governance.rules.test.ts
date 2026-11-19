import test from 'node:test';
import assert from 'node:assert/strict';
import {assertComplete,assertDecision} from './governance.rules';
test('director-required chief complaint blocks blank signature',()=>{assert.throws(()=>assertComplete({chiefComplaint:' '},['chiefComplaint']));assert.doesNotThrow(()=>assertComplete({chiefComplaint:'Motif documenté'},['chiefComplaint']));});
test('director-required specialized assessment cannot be satisfied by template metadata',()=>{assert.throws(()=>assertComplete({consultationModule:{structured:{specialtyExam:{specialty:'Neurologie',template:'NEURO',values:{}}}}},['consultationModule.structured.specialtyExam']));assert.doesNotThrow(()=>assertComplete({consultationModule:{structured:{specialtyExam:{values:{glasgow:'15'}}}}},['consultationModule.structured.specialtyExam']));});
test('recipient response requires an accepted referral',()=>{assert.throws(()=>assertDecision('REQUESTED','COMPLETE'));assert.doesNotThrow(()=>assertDecision('ACCEPTED','COMPLETE'));assert.throws(()=>assertDecision('COMPLETED','COMPLETE'));});
test('sender cancellation does not erase accepted opinions',()=>{assert.throws(()=>assertDecision('ACCEPTED','CANCEL'));assert.doesNotThrow(()=>assertDecision('REQUESTED','CANCEL'));});
