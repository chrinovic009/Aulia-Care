import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
export function assertOpenStatus(status?: string) {
  if (status && !['DRAFT', 'IN_PROGRESS'].includes(status)) throw new BadRequestException('La signature exige le parcours de validation et l’attestation du médecin ; l’archivage utilise son parcours dédié.');
}
const finalLab = new Set(['AVAILABLE','SENT','COMPLETED','VERIFIED']);
/** Read every persisted occurrence inside the signature transaction, never only the browser list. */
export async function assertExamResults(tx: Prisma.TransactionClient, c: {id:string;clinicId:string;patientId:string}, ordered: Array<any>) {
 const where={consultationId:c.id,clinicId:c.clinicId,patientId:c.patientId,deletedAt:null};
 const [labs,images]=await Promise.all([
  tx.labRequest.findMany({where:{...where,status:{not:'CANCELLED'}},include:{items:{where:{deletedAt:null}}}}),
  tx.imagingRequest.findMany({where:{...where,status:{not:'CANCELLED'}},include:{report:true}}),
 ]);
 const fail=()=>{throw new BadRequestException('La signature exige un résultat final valide pour tous les examens complémentaires commandés.');};
 for(const request of labs) if(!request.items.length || request.items.some(item=>!finalLab.has(item.status))) fail();
 for(const request of images) if(!['COMPLETED','VERIFIED'].includes(request.status) || !request.report) fail();
 for(const exam of ordered){
  if(!exam || typeof exam.catalogueItemId!=='string') fail();
  if(exam.category==='LABORATORY'){if(!labs.some(r=>r.items.some(i=>i.labTestId===exam.catalogueItemId && finalLab.has(i.status)))) fail();}
  else if(exam.category==='IMAGING'){if(!images.some(r=>r.imagingCatalogueId===exam.catalogueItemId && r.report)) fail();}
  else fail();
 }
}
