import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

/**
 * Generates the two values required by the offline production bootstrap.
 * It never writes them to disk. The operator must put them in the approved
 * secret store, execute the bootstrap once, then remove both values.
 */
async function main() {
  const token = randomBytes(32).toString('base64url');
  const hash = await bcrypt.hash(token, 12);

  console.log(`AULIA_INITIAL_DEV_BOOTSTRAP_TOKEN=${token}`);
  console.log(`AULIA_INITIAL_DEV_BOOTSTRAP_TOKEN_HASH=${hash}`);
  console.log('Store these values only in the approved production secret store. Do not commit them or leave them configured after bootstrap.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
