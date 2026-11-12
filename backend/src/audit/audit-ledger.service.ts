import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, RoleSlug } from '@prisma/client';
import { AuthenticatedActor, ClinicContextService } from '../core/clinic-context.service';
import { RequestContext } from '../core/request-context';
import { PrismaService } from '../prisma/prisma.service';

const LEDGER_READERS: readonly RoleSlug[] = [RoleSlug.SUPER_ADMIN, RoleSlug.ADMIN];

export interface LedgerQuery {
  entity?: string;
  entityId?: string;
  actorId?: string;
  beforeId?: string;
  limit?: number;
}

@Injectable()
export class AuditLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicContext: ClinicContextService,
  ) {}

  /** A record was shown to someone: written in the ledger before the response leaves. */
  async recordRead(context: RequestContext, entity: string, entityId: string) {
    await this.prisma.$executeRaw`
      INSERT INTO "AuditLedger" ("clinicId", "actorId", "actorRole", "action", "entity", "entityId", "context")
      VALUES (${context.clinicId ?? null}, ${context.userId}, ${context.role ?? null}, 'READ', ${entity}, ${entityId},
              ${JSON.stringify({ route: context.route ?? null })}::jsonb)`;
  }

  private async reader(actorInput?: AuthenticatedActor) {
    const actor = await this.clinicContext.requireOperationalActor(actorInput);
    if (!actor.primaryRole || !LEDGER_READERS.includes(actor.primaryRole)) {
      throw new ForbiddenException('Le registre d’audit est réservé à la direction de l’établissement.');
    }
    return actor;
  }

  async list(query: LedgerQuery, actorInput?: AuthenticatedActor) {
    const actor = await this.reader(actorInput);
    const where: Prisma.AuditLedgerWhereInput = {
      clinicId: actor.clinicId,
      entity: query.entity || undefined,
      entityId: query.entityId || undefined,
      actorId: query.actorId || undefined,
      id: query.beforeId && /^\d+$/.test(query.beforeId) ? { lt: BigInt(query.beforeId) } : undefined,
    };
    const rows = await this.prisma.auditLedger.findMany({
      where,
      orderBy: { id: 'desc' },
      take: Math.min(Math.max(Number(query.limit) || 100, 1), 500),
    });
    // BigInt is not JSON-serialisable.
    return rows.map((row) => ({ ...row, id: row.id.toString() }));
  }

  async verify(actorInput?: AuthenticatedActor) {
    const actor = await this.reader(actorInput);
    const [result] = await this.prisma.$queryRaw<Array<{ checked: bigint; firstInvalidId: bigint | null }>>`
      SELECT * FROM "audit_ledger_verify"(${actor.clinicId})`;
    return {
      checked: Number(result?.checked ?? 0),
      intact: result?.firstInvalidId === null || result?.firstInvalidId === undefined,
      firstInvalidId: result?.firstInvalidId?.toString() ?? null,
      verifiedAt: new Date().toISOString(),
    };
  }
}
