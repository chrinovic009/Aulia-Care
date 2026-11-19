import { SetMetadata } from '@nestjs/common';

export const AUDIT_READ_KEY = 'aulia:audit-read';

export interface AuditReadTarget {
  /** Audited entity name, e.g. Patient, Consultation. */
  entity: string;
  /** Route parameter holding the entity id. */
  param: string;
}

/** Records a READ in the audit ledger every time this route returns a record. */
export const AuditRead = (entity: string, param = 'id') => SetMetadata(AUDIT_READ_KEY, { entity, param } satisfies AuditReadTarget);
