import { BadRequestException } from '@nestjs/common';
import { findSpecialty } from '../reference/medical-specialties';
const fields: Record<string, Record<string, string[] | null>> = {"SURGICAL": {"surgicalIndication": null, "site": null, "laterality": ["Droite", "Gauche", "Bilatérale", "Médiane", "Sans objet"], "urgency": ["Programmé", "Urgent différé", "Urgence immédiate"], "surgicalDecision": ["Intervention proposée", "Surveillance", "Avis complémentaire", "Pas d’indication chirurgicale"], "consentDiscussed": ["Oui", "Non", "Non évalué"], "anesthesiaConsult": ["Oui", "Non", "Non évalué"], "surgicalNotes": null}, "WOMEN": {"lmp": null, "gestationalAge": null, "gravida": null, "parity": null, "livingChildren": null, "contraception": null, "lastSmear": null, "fundalHeight": null, "fetalHeart": null, "fetalMovements": ["Oui", "Non", "Non évalué"], "cervix": null, "bleeding": null, "breasts": null, "obstetricNotes": null}, "PEDIATRIC": {"weightKg": null, "heightCm": null, "headCircumference": null, "growthCurve": null, "feeding": null, "development": null, "vaccination": ["À jour", "En retard", "Carnet absent"], "caregiver": null, "pediatricNotes": null}, "NEURO": {"glasgow": null, "orientation": null, "cranialNerves": null, "motor": null, "sensory": null, "reflexes": null, "gait": null, "language": null, "mood": null, "thought": null, "insight": null, "riskAssessed": ["Évalué : pas de risque immédiat", "Évalué : risque, mesures prises", "Non évalué"], "neuroNotes": null}, "SENSORY": {"vaRight": null, "vaLeft": null, "iopRight": null, "iopLeft": null, "fundus": null, "otoscopyRight": null, "otoscopyLeft": null, "hearing": null, "nose": null, "throat": null, "sensoryNotes": null}, "DENTAL": {"hygiene": ["Bonne", "Moyenne", "Mauvaise"], "gums": null, "mucosa": null, "occlusion": null, "dentalPlan": null}, "PREVENTION": {"visitType": ["Embauche", "Périodique", "Reprise", "Dépistage", "Voyage", "Scolaire", "Autre"], "exposure": null, "vaccinations": ["À jour", "À compléter", "Inconnu"], "fitness": ["Apte", "Apte avec restrictions", "Inapte temporaire", "Inapte", "Sans objet"], "restrictions": null, "preventionAdvice": null}, "CRITICAL": {"abcde": null, "severity": null, "asa": ["I", "II", "III", "IV", "V", "VI", "Non évaluée"], "mallampati": ["I", "II", "III", "IV", "Non évalué"], "fasting": null, "anesthesiaHistory": null, "criticalNotes": null}};

/** Structural checks only; do not invent specialty mandatory clinical assessments. */
export function validateSpecialtyAssessment(module: Record<string, any> | null, doctorSpecialty?: string | null, signing = false) {
 const exam=module?.structured?.specialtyExam;
 if(!exam) return;
 const reject=()=>{throw new BadRequestException('Évaluation spécialisée invalide : vérifiez les champs, valeurs et spécialité du médecin.');};
 const expected=findSpecialty(doctorSpecialty || '');
 if(typeof exam!=='object' || Array.isArray(exam) || !expected || exam.template!==expected.template || exam.specialty!==expected.label) reject();
 const schema=fields[expected?.template || ''];
 if(!schema || !exam.values || typeof exam.values!=='object' || Array.isArray(exam.values)) reject();
 for(const [key,value] of Object.entries(exam.values)) {
  if(!(key in schema) || typeof value!=='string' || value.length>8000) reject();
  if(typeof value!=='string' || !value.trim()) continue;
  if(schema[key] && !schema[key]?.includes(value)) reject();
  if(key==='glasgow' && (!/^\d+$/.test(value) || Number(value)<3 || Number(value)>15)) reject();
  if(['gravida','parity','livingChildren'].includes(key) && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) reject();
  if(['weightKg','heightCm','headCircumference','fundalHeight','iopRight','iopLeft'].includes(key) && (!/^\d+(?:[.,]\d+)?$/.test(value) || Number(value.replace(',','.'))<=0)) reject();
 }
 if(exam.teeth) {
  if(exam.template!=='DENTAL' || typeof exam.teeth!=='object' || Array.isArray(exam.teeth)) reject();
  for(const [tooth,state] of Object.entries(exam.teeth)) if(!/^[1-4][1-8]$/.test(tooth) || !['','Saine','Carie','Obturée','Absente','À extraire','Couronne','Implant','Fracturée'].includes(String(state))) reject();
 }
 if(signing && !Object.values(exam.values).some(v=>typeof v==='string' && v.trim()) && !Object.values(exam.teeth || {}).some(Boolean)) reject();
}
