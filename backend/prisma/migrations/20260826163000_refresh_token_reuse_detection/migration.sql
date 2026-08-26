CREATE TABLE IF NOT EXISTS "SessionRefreshTokenHistory" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionRefreshTokenHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionRefreshTokenHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SessionRefreshTokenHistory_sessionId_consumedAt_idx"
  ON "SessionRefreshTokenHistory"("sessionId", "consumedAt");
