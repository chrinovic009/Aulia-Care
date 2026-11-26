import 'dotenv/config';
import { LoginResult, PrismaClient, SessionStatus } from '@prisma/client';

/**
 * Safe maintenance job. Run from the hospital scheduler once daily. Successful
 * login telemetry is kept for 90 days; failed attempts for 365 days. Consumed
 * refresh hashes are removed only after the associated session is both no
 * longer active and expired beyond the replay-detection retention window.
 */
const prisma = new PrismaClient();
const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

async function main() {
  const [successfulAttempts, failedAttempts, refreshHistory, retiredSessions] = await prisma.$transaction(async (tx) => {
    // This script has no HTTP request. Declare its narrow maintenance identity
    // explicitly instead of relying on the database owner bypassing RLS.
    await tx.$executeRaw`SELECT
      set_config('app.user_id', 'security-retention', true),
      set_config('app.user_role', 'SECURITY_MAINTENANCE', true),
      set_config('app.user_roles', '[]', true),
      set_config('app.clinic_id', '', true),
      set_config('app.patient_id', '', true),
      set_config('app.patient_clinic_id', '', true),
      set_config('app.route', 'maintenance.security-retention', true),
      set_config('role', 'aulia_app', true)`;
    return Promise.all([
      tx.loginAttempt.deleteMany({ where: { result: LoginResult.SUCCESS, occurredAt: { lt: daysAgo(90) } } }),
      tx.loginAttempt.deleteMany({ where: { result: LoginResult.FAILURE, occurredAt: { lt: daysAgo(365) } } }),
      tx.sessionRefreshTokenHistory.deleteMany({
        where: {
          consumedAt: { lt: daysAgo(90) },
          session: { status: { in: [SessionStatus.REVOKED, SessionStatus.EXPIRED] }, expiresAt: { lt: daysAgo(90) } },
        },
      }),
      tx.session.deleteMany({
        where: { status: { in: [SessionStatus.REVOKED, SessionStatus.EXPIRED] }, expiresAt: { lt: daysAgo(90) } },
      }),
    ]);
  });
  console.info(JSON.stringify({ successfulAttempts: successfulAttempts.count, failedAttempts: failedAttempts.count, refreshHistory: refreshHistory.count, retiredSessions: retiredSessions.count }));
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
