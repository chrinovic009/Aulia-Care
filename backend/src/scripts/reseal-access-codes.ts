import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { openAccessCodeDetailed, sealAccessCode } from '../auth/access-code-vault';

/**
 * One-off upgrade job: re-encrypts pending access codes that were sealed with
 * the legacy JWT_SECRET-derived key under the dedicated AULIA_ACCESS_CODE_KEY.
 * Dry run by default; pass --apply to write. A row is rewritten only if its
 * cipher is still the one that was read (no race with a code being used).
 */
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  if (!process.env.AULIA_ACCESS_CODE_KEY) throw new Error('AULIA_ACCESS_CODE_KEY doit être configurée avant de resceller les codes.');
  const pending = await prisma.user.findMany({ where: { temporaryCodeCipher: { not: null } }, select: { id: true, temporaryCodeCipher: true } });
  let legacy = 0; let unreadable = 0; let resealed = 0;
  for (const row of pending) {
    const opened = openAccessCodeDetailed(row.temporaryCodeCipher!);
    if (!opened) { unreadable += 1; continue; }
    if (!opened.legacy) continue;
    legacy += 1;
    if (!apply) continue;
    const result = await prisma.user.updateMany({
      where: { id: row.id, temporaryCodeCipher: row.temporaryCodeCipher },
      data: { temporaryCodeCipher: sealAccessCode(opened.code) },
    });
    resealed += result.count;
  }
  // Counts only: no identifiers or codes in the output.
  console.info(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', pending: pending.length, legacy, resealed, unreadable }));
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
