import { apiFetch } from '../config/api';
export type Physician={id:string;displayName:string;specialty?:string;roles:{id:string}[]};
export type Policy={id:string;specialty:string;required:string[];rationale:string;version:number;approvedAt:string;approver:{displayName:string}};
export type Referral={id:string;patientId:string;sourceConsultationId:string;recipientConsultationId?:string;senderId:string;recipientId:string;question:string;urgency:string;status:string;response?:string;version:number;patient:{firstName:string;lastName:string};sender:{displayName:string};recipient:{displayName:string;specialty?:string}};
export const physicians=()=>apiFetch<Physician[]>('/medical-governance/physicians');
export const policies=()=>apiFetch<Policy[]>('/medical-governance/policies');
export const referrals=()=>apiFetch<Referral[]>('/medical-governance/referrals');
export const mutation=<T,>(path:string,body:unknown,method='POST')=>apiFetch<T>('/medical-governance/'+path,{method,body:JSON.stringify(body)});
export const fields=[['chiefComplaint','Motif'],['medicalHistory','Antécédents'],['currentSymptoms','Anamnèse'],['clinicalExam','Examen clinique'],['diagnosis','Conclusion diagnostique'],['treatmentPlan','Prise en charge'],['followUp','Suivi'],['consultationModule.structured.specialtyExam','Évaluation spécialisée']] as const;
