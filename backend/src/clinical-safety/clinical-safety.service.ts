import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleSlug } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor, ClinicContextService, OperationalClinicActor } from '../core/clinic-context.service';
import { canonicalSubstance } from './domain/prescription-safety';
import { evaluateForPatient } from './prescription-safety.check';
import {
  CheckPrescriptionDto,
  ProposeInteractionRuleDto,
  RecordAllergyDto,
  ResolveAllergyDto,
  RetireRuleDto,
  RuleDecisionDto,
  UpdateMedicationIdentityDto,
} from './dto/clinical-safety.dto';

/** Who may document or resolve an allergy. */
export const ALLERGY_WRITERS: readonly RoleSlug[] = [
  RoleSlug.PHYSICIAN, RoleSlug.SURGEON, RoleSlug.ANESTHESIOLOGIST, RoleSlug.NURSE, RoleSlug.MIDWIFE, RoleSlug.PHARMACIST,
];
/** Who may propose, validate or retire the establishment's interaction rules. */
export const RULE_MANAGERS: readonly RoleSlug[] = [RoleSlug.PHARMACIST, RoleSlug.PHYSICIAN];

/**
 * Patient allergies, the establishment's validated interaction rules and the
 * identity (DCI, ATC) of catalogue medications - the inputs of the prescription
 * safety check. Nothing here is clinical knowledge shipped by Aulia Care.
 */
@Injectable()
export class ClinicalSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  private async actor(user?: AuthenticatedActor, allowed?: readonly RoleSlug[]): Promise<OperationalClinicActor> {
    const actor = await this.clinicContext.requireOperationalActor(user);
    if (allowed && (!actor.primaryRole || !allowed.includes(actor.primaryRole))) {
      throw new ForbiddenException("Votre rôle ne permet pas cette action de sécurité clinique.");
    }
    return actor;
  }

  private async patientInClinic(patientId: string, clinicId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, clinicId, deletedAt: null }, select: { id: true } });
    if (!patient) throw new NotFoundException('Patient introuvable dans votre établissement.');
    return patient;
  }

  // ---------------------------------------------------------------- allergies
  async listAllergies(patientId: string, user?: AuthenticatedActor) {
    const actor = await this.actor(user);
    await this.patientInClinic(patientId, actor.clinicId);
    return this.prisma.allergy.findMany({
      where: { patientId, deletedAt: null },
      orderBy: [{ resolved: 'asc' }, { recordedAt: 'desc' }],
      include: { recordedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async recordAllergy(patientId: string, dto: RecordAllergyDto, user?: AuthenticatedActor) {
    const actor = await this.actor(user, ALLERGY_WRITERS);
    await this.patientInClinic(patientId, actor.clinicId);
    const substance = dto.substance.trim();
    const duplicate = await this.prisma.allergy.findFirst({
      where: { patientId, resolved: false, deletedAt: null, substance: { equals: substance, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Cette allergie est déjà documentée pour ce patient.');
    return this.prisma.allergy.create({
      data: {
        patientId,
        substance,
        reaction: dto.reaction?.trim() || null,
        severity: dto.severity,
        notes: dto.notes?.trim() || null,
        recordedById: actor.id,
      },
    });
  }

  /** An allergy is never deleted: it is resolved with a reason (e.g. documented as an error). */
  async resolveAllergy(allergyId: string, dto: ResolveAllergyDto, user?: AuthenticatedActor) {
    const actor = await this.actor(user, ALLERGY_WRITERS);
    const allergy = await this.prisma.allergy.findFirst({
      where: { id: allergyId, deletedAt: null, patient: { clinicId: actor.clinicId } },
    });
    if (!allergy) throw new NotFoundException('Allergie introuvable dans votre établissement.');
    if (allergy.resolved) throw new ConflictException('Cette allergie est déjà levée.');
    const note = `[${new Date().toISOString()}] Levée : ${dto.reason.trim()}`;
    const updated = await this.prisma.allergy.updateMany({
      where: { id: allergyId, version: allergy.version, resolved: false },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        notes: allergy.notes ? `${allergy.notes}\n${note}` : note,
        version: { increment: 1 },
      },
    });
    if (!updated.count) throw new ConflictException("L'allergie a été modifiée entre-temps. Rechargez-la.");
    return this.prisma.allergy.findUnique({ where: { id: allergyId } });
  }

  // ---------------------------------------------------------- interaction rules
  async listRules(user?: AuthenticatedActor, status?: string) {
    const actor = await this.actor(user);
    const where: Prisma.DrugInteractionRuleWhereInput = { clinicId: actor.clinicId };
    if (status === 'PROPOSED' || status === 'ACTIVE' || status === 'RETIRED') where.status = status;
    return this.prisma.drugInteractionRule.findMany({
      where,
      orderBy: [{ status: 'asc' }, { substanceA: 'asc' }, { substanceB: 'asc' }],
      include: {
        proposedBy: { select: { id: true, firstName: true, lastName: true } },
        validatedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async proposeRule(dto: ProposeInteractionRuleDto, user?: AuthenticatedActor) {
    const actor = await this.actor(user, RULE_MANAGERS);
    const [substanceA, substanceB] = [canonicalSubstance(dto.substanceA), canonicalSubstance(dto.substanceB)].sort();
    if (substanceA.length < 3 || substanceB.length < 3) throw new BadRequestException('Substances invalides.');
    if (substanceA === substanceB) throw new BadRequestException('Une interaction relie deux substances différentes.');
    const data = {
      severity: dto.severity,
      effect: dto.effect.trim(),
      recommendation: dto.recommendation?.trim() || null,
      source: dto.source.trim(),
      status: 'PROPOSED' as const,
      statusReason: null,
      proposedById: actor.id,
      validatedById: null,
      validatedAt: null,
    };
    const existing = await this.prisma.drugInteractionRule.findUnique({
      where: { clinicId_substanceA_substanceB: { clinicId: actor.clinicId, substanceA, substanceB } },
    });
    if (existing && existing.status !== 'RETIRED') {
      throw new ConflictException('Une règle existe déjà pour ces deux substances : retirez-la avant d’en proposer une autre.');
    }
    if (existing) return this.prisma.drugInteractionRule.update({ where: { id: existing.id }, data });
    return this.prisma.drugInteractionRule.create({ data: { ...data, clinicId: actor.clinicId, substanceA, substanceB } });
  }

  /** Four-eyes principle: a rule only applies once someone other than its author validated it. */
  async validateRule(ruleId: string, dto: RuleDecisionDto, user?: AuthenticatedActor) {
    const actor = await this.actor(user, RULE_MANAGERS);
    const rule = await this.findRule(ruleId, actor.clinicId);
    if (rule.status !== 'PROPOSED') throw new ConflictException('Seule une règle proposée peut être validée.');
    if (rule.proposedById === actor.id) throw new ForbiddenException("L'auteur d'une règle ne peut pas la valider lui-même.");
    const updated = await this.prisma.drugInteractionRule.updateMany({
      where: { id: ruleId, status: 'PROPOSED' },
      data: { status: 'ACTIVE', validatedById: actor.id, validatedAt: new Date(), statusReason: dto.reason?.trim() || null },
    });
    if (!updated.count) throw new ConflictException('La règle a changé entre-temps.');
    return this.findRule(ruleId, actor.clinicId);
  }

  async retireRule(ruleId: string, dto: RetireRuleDto, user?: AuthenticatedActor) {
    const actor = await this.actor(user, RULE_MANAGERS);
    const rule = await this.findRule(ruleId, actor.clinicId);
    if (rule.status === 'RETIRED') throw new ConflictException('Cette règle est déjà retirée.');
    await this.prisma.drugInteractionRule.update({
      where: { id: ruleId },
      data: { status: 'RETIRED', statusReason: dto.reason.trim() },
    });
    return this.findRule(ruleId, actor.clinicId);
  }

  private async findRule(ruleId: string, clinicId: string) {
    const rule = await this.prisma.drugInteractionRule.findFirst({ where: { id: ruleId, clinicId } });
    if (!rule) throw new NotFoundException("Règle d'interaction introuvable dans votre établissement.");
    return rule;
  }

  // ------------------------------------------------------------- medications
  async listMedicationIdentities(user?: AuthenticatedActor, search?: string) {
    await this.actor(user);
    const term = search?.trim();
    return this.prisma.medication.findMany({
      where: {
        deletedAt: null,
        ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { activeSubstance: { contains: term, mode: 'insensitive' } }, { atcCode: { startsWith: term.toUpperCase() } }] } : {}),
      },
      select: { id: true, name: true, activeSubstance: true, atcCode: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
  }

  async updateMedicationIdentity(medicationId: string, dto: UpdateMedicationIdentityDto, user?: AuthenticatedActor) {
    await this.actor(user, [RoleSlug.PHARMACIST]);
    const medication = await this.prisma.medication.findFirst({ where: { id: medicationId, deletedAt: null }, select: { id: true } });
    if (!medication) throw new NotFoundException('Médicament introuvable.');
    return this.prisma.medication.update({
      where: { id: medicationId },
      data: {
        ...(dto.activeSubstance !== undefined ? { activeSubstance: dto.activeSubstance.trim() || null } : {}),
        ...(dto.atcCode !== undefined ? { atcCode: dto.atcCode.trim().toUpperCase() || null } : {}),
      },
      select: { id: true, name: true, activeSubstance: true, atcCode: true },
    });
  }

  // -------------------------------------------------------------------- check
  /** Same evaluation as at prescription time, so the prescriber sees alerts before signing. */
  async check(patientId: string, dto: CheckPrescriptionDto, user?: AuthenticatedActor) {
    const actor = await this.actor(user);
    await this.patientInClinic(patientId, actor.clinicId);
    const prescribed = await this.prisma.medication.findMany({
      where: { id: { in: dto.medicationIds }, deletedAt: null },
      select: { id: true, name: true, activeSubstance: true, atcCode: true },
    });
    return evaluateForPatient(this.prisma, { clinicId: actor.clinicId, patientId, prescribed });
  }
}
