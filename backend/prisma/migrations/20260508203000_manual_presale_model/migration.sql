ALTER TABLE "Launch"
  DROP COLUMN IF EXISTS "dexAdapterAddress",
  DROP COLUMN IF EXISTS "buybackPercent",
  DROP COLUMN IF EXISTS "buybackChunkPercent",
  DROP COLUMN IF EXISTS "buybackIntervalSeconds";

ALTER TABLE "StatsCache" ADD COLUMN IF NOT EXISTS "totalRaisedTon" DOUBLE PRECISION NOT NULL DEFAULT 0;
UPDATE "StatsCache" SET "totalRaisedTon" = COALESCE("totalLiquidityTon", 0) WHERE "totalRaisedTon" = 0;
ALTER TABLE "StatsCache" DROP COLUMN IF EXISTS "totalLiquidityTon";

ALTER TYPE "LaunchStatus" RENAME TO "LaunchStatus_old";
CREATE TYPE "LaunchStatus" AS ENUM ('upcoming', 'live', 'succeeded', 'failed');
ALTER TABLE "Launch"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "LaunchStatus"
    USING (CASE WHEN "status"::text = 'migrated' THEN 'succeeded' ELSE "status"::text END)::"LaunchStatus",
  ALTER COLUMN "status" SET DEFAULT 'upcoming';
DROP TYPE "LaunchStatus_old";

ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
CREATE TYPE "TransactionType" AS ENUM ('launch', 'contribute', 'claim', 'refund', 'treasury');
ALTER TABLE "Transaction"
  ALTER COLUMN "type" TYPE "TransactionType"
    USING (
      CASE
        WHEN "type"::text IN ('migrate', 'buyback') THEN 'treasury'
        ELSE "type"::text
      END
    )::"TransactionType";
DROP TYPE "TransactionType_old";
