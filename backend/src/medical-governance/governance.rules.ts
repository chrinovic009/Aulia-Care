import { BadRequestException } from '@nestjs/common';
export const FIELD_PATHS = ['chiefComplaint','medicalHistory','currentSymptoms','clinicalExam','diagnosis','treatmentPlan','followUp','consultationModule.structured.specialtyExam'] as const;
export function assertComplete(content: Record<string, any>, required: string[]) {
 const meaningful=(v:any):boolean => typeof v==='string' ? !!v.trim() : typeof v==='number' ? Number.isFinite(v) : Array.isArray(v) ? v.some(meaningful) : !!v && typeof v==='object' && Object.values(v).some(meaningful);
 for(const path of required){const value=path.split('.').reduce((v:any,k)=>v?.[k],content);const clinicalValue=path.endsWith('specialtyExam') ? {values:value?.values,teeth:value?.teeth} : value;if(!meaningful(clinicalValue))throw new BadRequestException(`Signature refusée : rubrique obligatoire absente (${path}).`);}
}
export function assertDecision(status:string, action:string) {
 const allowed:Record<string,string[]>={ACCEPT:['REQUESTED'],REJECT:['REQUESTED'],CANCEL:['REQUESTED'],COMPLETE:['ACCEPTED']};
 if(!allowed[action]?.includes(status))throw new BadRequestException('Cette demande ne peut plus être modifiée dans cet état.');
}
