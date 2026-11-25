import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync } from 'fs';
import { join } from 'path';
import type { Prisma } from '@prisma/client';

/**
 * Local, append-only safety net for audit refusals that could not be written to
 * PostgreSQL (database down after retries). Records keep their pre-assigned id,
 * so a replay after a crash is idempotent (createMany skipDuplicates). The file
 * stays on the clinic server (private 0600 file in a 0700 directory) and is
 * replayed at start-up and after every successful audit write.
 */
export type SpooledAudit = Prisma.AuditLogUncheckedCreateInput & { id: string };

function spoolDir() {
  return process.env.AULIA_AUDIT_SPOOL_DIR || join(process.cwd(), '.audit-spool');
}
const pendingFile = () => join(spoolDir(), 'pending.jsonl');
const replayFile = () => join(spoolDir(), 'replaying.jsonl');

export function spoolAuditRecords(records: SpooledAudit[]) {
  if (!records.length) return;
  mkdirSync(spoolDir(), { recursive: true, mode: 0o700 });
  const fd = openSync(pendingFile(), 'a', 0o600);
  try {
    appendFileSync(fd, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function parse(file: string): SpooledAudit[] {
  if (!existsSync(file)) return [];
  const records: SpooledAudit[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as SpooledAudit;
      if (record && typeof record.id === 'string') records.push(record);
    } catch {
      // A torn last line (crash during append) is skipped, the rest is kept.
    }
  }
  return records;
}

/** Number of audit records waiting on disk (exposed by the readiness check). */
export function pendingAuditCount() {
  return parse(pendingFile()).length + parse(replayFile()).length;
}

/**
 * Moves pending records aside, hands them to `persist`, and deletes them only
 * after it succeeded. On failure they are put back for the next attempt.
 */
export async function replaySpooledAudits(persist: (records: SpooledAudit[]) => Promise<void>) {
  if (!existsSync(replayFile()) && existsSync(pendingFile())) renameSync(pendingFile(), replayFile());
  const records = parse(replayFile());
  if (!records.length) {
    rmSync(replayFile(), { force: true });
    return 0;
  }
  await persist(records);
  rmSync(replayFile(), { force: true });
  return records.length;
}
