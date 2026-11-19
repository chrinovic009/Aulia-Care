/**
 * Care Workflow Engine - pure domain rules.
 *
 * No Prisma, no HTTP: these functions decide whether an organisational change is
 * allowed (status transitions, mandatory justifications, mandatory steps before
 * closure, unit permissions). They never decide anything clinical: the content of
 * requests, priorities and outcomes always comes from the professionals.
 */
export type ServiceRequestStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'REVOKED' | 'COMPLETED' | 'ENTERED_IN_ERROR';
export type CareTaskStatus =
  | 'REQUESTED' | 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'READY'
  | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
export type CareEpisodeStatus = 'PLANNED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED' | 'ENTERED_IN_ERROR';
export type CareTransferStatus = 'SENT' | 'RECEIVED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
export type CareUnitRole = 'MEMBER' | 'LEAD' | 'READ_ONLY';

export type WorkflowEntity = 'serviceRequest' | 'task' | 'episode' | 'transfer';

export class WorkflowRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'WorkflowRuleError';
  }
}

interface StateMachine<S extends string> {
  transitions: Readonly<Record<S, readonly S[]>>;
  /** Target states that need a written justification. */
  reasonRequired: readonly S[];
  labels: Readonly<Record<S, string>>;
}

const SERVICE_REQUEST: StateMachine<ServiceRequestStatus> = {
  transitions: {
    DRAFT: ['ACTIVE', 'REVOKED', 'ENTERED_IN_ERROR'],
    ACTIVE: ['ON_HOLD', 'REVOKED', 'COMPLETED', 'ENTERED_IN_ERROR'],
    ON_HOLD: ['ACTIVE', 'REVOKED', 'ENTERED_IN_ERROR'],
    REVOKED: [],
    COMPLETED: [],
    ENTERED_IN_ERROR: [],
  },
  reasonRequired: ['ON_HOLD', 'REVOKED', 'ENTERED_IN_ERROR'],
  labels: {
    DRAFT: 'brouillon', ACTIVE: 'active', ON_HOLD: 'suspendue', REVOKED: 'annulée',
    COMPLETED: 'terminée', ENTERED_IN_ERROR: 'saisie en erreur',
  },
};

const TASK: StateMachine<CareTaskStatus> = {
  transitions: {
    REQUESTED: ['RECEIVED', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
    RECEIVED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
    ACCEPTED: ['READY', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    READY: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'FAILED'],
    ON_HOLD: ['READY', 'IN_PROGRESS', 'CANCELLED', 'FAILED'],
    REJECTED: [],
    COMPLETED: [],
    CANCELLED: [],
    FAILED: [],
  },
  reasonRequired: ['REJECTED', 'CANCELLED', 'FAILED', 'ON_HOLD'],
  labels: {
    REQUESTED: 'demandée', RECEIVED: 'reçue', ACCEPTED: 'acceptée', REJECTED: 'refusée', READY: 'prête',
    IN_PROGRESS: 'en cours', ON_HOLD: 'suspendue', COMPLETED: 'terminée', CANCELLED: 'annulée', FAILED: 'échouée',
  },
};

const EPISODE: StateMachine<CareEpisodeStatus> = {
  transitions: {
    PLANNED: ['IN_PROGRESS', 'CANCELLED', 'ENTERED_IN_ERROR'],
    IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'ENTERED_IN_ERROR'],
    ON_HOLD: ['IN_PROGRESS', 'COMPLETED', 'ENTERED_IN_ERROR'],
    COMPLETED: [],
    CANCELLED: [],
    ENTERED_IN_ERROR: [],
  },
  reasonRequired: ['ON_HOLD', 'CANCELLED', 'ENTERED_IN_ERROR'],
  labels: {
    PLANNED: 'planifiée', IN_PROGRESS: 'en cours', ON_HOLD: 'suspendue', COMPLETED: 'clôturée',
    CANCELLED: 'annulée', ENTERED_IN_ERROR: 'saisie en erreur',
  },
};

const TRANSFER: StateMachine<CareTransferStatus> = {
  transitions: {
    SENT: ['RECEIVED', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
    RECEIVED: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: [],
    REJECTED: [],
    CANCELLED: [],
  },
  reasonRequired: ['REJECTED', 'CANCELLED'],
  labels: { SENT: 'envoyé', RECEIVED: 'reçu', ACCEPTED: 'accepté', REJECTED: 'refusé', CANCELLED: 'annulé' },
};

const MACHINES = {
  serviceRequest: SERVICE_REQUEST,
  task: TASK,
  episode: EPISODE,
  transfer: TRANSFER,
} as const;

const ENTITY_LABELS: Record<WorkflowEntity, string> = {
  serviceRequest: 'La demande',
  task: 'La tâche',
  episode: 'La prise en charge',
  transfer: 'Le transfert',
};

const machine = (entity: WorkflowEntity) => MACHINES[entity] as unknown as StateMachine<string>;

export function isTerminal(entity: WorkflowEntity, status: string): boolean {
  const next = machine(entity).transitions[status];
  if (!next) throw new WorkflowRuleError('UNKNOWN_STATUS', `Statut inconnu : ${status}.`);
  return next.length === 0;
}

export function allowedTransitions(entity: WorkflowEntity, from: string): readonly string[] {
  const next = machine(entity).transitions[from];
  if (!next) throw new WorkflowRuleError('UNKNOWN_STATUS', `Statut inconnu : ${from}.`);
  return next;
}

/**
 * Throws a WorkflowRuleError when `from -> to` is not allowed, or when the target
 * status needs a written justification that is missing. Returns the trimmed reason.
 */
export function assertTransition(entity: WorkflowEntity, from: string, to: string, reason?: string | null): string | null {
  const definition = machine(entity);
  const label = (status: string) => definition.labels[status] ?? status;
  if (!definition.transitions[to]) throw new WorkflowRuleError('UNKNOWN_STATUS', `Statut inconnu : ${to}.`);
  if (from === to) {
    throw new WorkflowRuleError('NO_CHANGE', `${ENTITY_LABELS[entity]} est déjà ${label(to)}.`);
  }
  if (!allowedTransitions(entity, from).includes(to)) {
    throw new WorkflowRuleError(
      'TRANSITION_NOT_ALLOWED',
      `${ENTITY_LABELS[entity]} ne peut pas passer de « ${label(from)} » à « ${label(to)} ».`,
    );
  }
  const trimmed = reason?.trim() || null;
  if (definition.reasonRequired.includes(to) && !trimmed) {
    throw new WorkflowRuleError('REASON_REQUIRED', `Une justification est obligatoire pour passer à « ${label(to)} ».`);
  }
  return trimmed;
}

/** Reassigning work that already has an owner always needs a justification. */
export function assertReassignment(currentOwnerId: string | null | undefined, nextOwnerId: string | null, reason?: string | null): string | null {
  const trimmed = reason?.trim() || null;
  if (currentOwnerId && currentOwnerId !== nextOwnerId && !trimmed) {
    throw new WorkflowRuleError('REASON_REQUIRED', 'Une réaffectation doit être justifiée.');
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Unit permissions
// ---------------------------------------------------------------------------

export type UnitAction = 'read' | 'write' | 'validate' | 'reassign' | 'configure';

const UNIT_ROLE_ACTIONS: Record<CareUnitRole, readonly UnitAction[]> = {
  READ_ONLY: ['read'],
  MEMBER: ['read', 'write'],
  LEAD: ['read', 'write', 'validate', 'reassign', 'configure'],
};

export function unitRoleAllows(role: CareUnitRole | null | undefined, action: UnitAction): boolean {
  return Boolean(role && UNIT_ROLE_ACTIONS[role]?.includes(action));
}

// ---------------------------------------------------------------------------
// Events: corrections and mandatory steps
// ---------------------------------------------------------------------------

/** Event type recorded to retract an erroneous event without deleting it. */
export const ENTERED_IN_ERROR_EVENT = 'ENTERED_IN_ERROR';

export interface EventLike {
  id: string;
  type: string;
  correctsEventId?: string | null;
}

/**
 * Events still in force: an event is superseded as soon as another event corrects
 * it (a replacement or an ENTERED_IN_ERROR retraction). Retraction markers are not
 * themselves in force.
 */
export function eventsInForce<T extends EventLike>(events: readonly T[]): T[] {
  const corrected = new Set(events.map((event) => event.correctsEventId).filter((id): id is string => Boolean(id)));
  return events.filter((event) => !corrected.has(event.id) && event.type !== ENTERED_IN_ERROR_EVENT);
}

export function assertCorrection(original: EventLike | null | undefined, reason?: string | null): string {
  if (!original) throw new WorkflowRuleError('EVENT_NOT_FOUND', 'Événement à corriger introuvable.');
  const trimmed = reason?.trim();
  if (!trimmed) throw new WorkflowRuleError('REASON_REQUIRED', 'Une correction doit être justifiée.');
  return trimmed;
}

export interface ClosureRequirement {
  /** Event type that must exist (in force) before closure. */
  eventType: string;
  label: string;
}

/** Labels of the mandatory steps still missing before an episode can be closed. */
export function missingClosureRequirements(
  requirements: readonly ClosureRequirement[] | null | undefined,
  events: readonly EventLike[],
): string[] {
  if (!requirements?.length) return [];
  const present = new Set(eventsInForce(events).map((event) => event.type));
  return requirements.filter((requirement) => !present.has(requirement.eventType)).map((requirement) => requirement.label);
}

export function assertClosable(requirements: readonly ClosureRequirement[] | null | undefined, events: readonly EventLike[]): void {
  const missing = missingClosureRequirements(requirements, events);
  if (missing.length) {
    throw new WorkflowRuleError('MANDATORY_STEPS_MISSING', `Clôture impossible, étapes obligatoires manquantes : ${missing.join(', ')}.`);
  }
}

/** Reads closure requirements from a unit `settings` JSON, ignoring malformed entries. */
export function closureRequirementsFromSettings(settings: unknown): ClosureRequirement[] {
  const raw = (settings as { closureRequirements?: unknown } | null)?.closureRequirements;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is ClosureRequirement =>
      Boolean(item) && typeof (item as ClosureRequirement).eventType === 'string' && typeof (item as ClosureRequirement).label === 'string')
    .map((item) => ({ eventType: item.eventType.trim(), label: item.label.trim() }))
    .filter((item) => item.eventType && item.label);
}
