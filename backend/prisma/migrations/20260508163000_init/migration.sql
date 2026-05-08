CREATE TYPE "LaunchStatus" AS ENUM ('upcoming', 'live', 'succeeded', 'failed', 'migrated');

CREATE TYPE "TransactionType" AS ENUM ('launch', 'contribute', 'claim', 'refund', 'migrate', 'buyback');

CREATE TABLE "Launch" (
    "id" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT,
    "creatorWallet" TEXT NOT NULL,
    "factoryAddress" TEXT NOT NULL,
    "tokenMasterAddress" TEXT,
    "presalePoolAddress" TEXT,
    "dexAdapterAddress" TEXT NOT NULL,
    "txHash" TEXT,
    "softCap" DOUBLE PRECISION NOT NULL,
    "hardCap" DOUBLE PRECISION NOT NULL,
    "raisedTon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liquidityPercent" DOUBLE PRECISION NOT NULL,
    "buybackPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buybackChunkPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buybackIntervalSeconds" INTEGER NOT NULL DEFAULT 0,
    "status" "LaunchStatus" NOT NULL DEFAULT 'upcoming',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "totalSupply" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decimals" INTEGER NOT NULL DEFAULT 9,
    "presaleRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minContribution" DOUBLE PRECISION,
    "maxContribution" DOUBLE PRECISION,
    "presaleAllocation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "liquidityAllocation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creatorAllocation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "social" JSONB,
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Launch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amountTon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokenAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Holder" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "tokenBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatsCache" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "tokensLaunched" INTEGER NOT NULL DEFAULT 0,
    "totalLiquidityTon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activeHolders" INTEGER NOT NULL DEFAULT 0,
    "volume24hTon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatsCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Launch_tokenMasterAddress_key" ON "Launch"("tokenMasterAddress");
CREATE UNIQUE INDEX "Launch_presalePoolAddress_key" ON "Launch"("presalePoolAddress");
CREATE UNIQUE INDEX "Launch_txHash_key" ON "Launch"("txHash");
CREATE INDEX "Launch_creatorWallet_idx" ON "Launch"("creatorWallet");
CREATE INDEX "Launch_status_idx" ON "Launch"("status");
CREATE INDEX "Launch_createdAt_idx" ON "Launch"("createdAt");
CREATE INDEX "Launch_symbol_idx" ON "Launch"("symbol");

CREATE UNIQUE INDEX "Transaction_txHash_key" ON "Transaction"("txHash");
CREATE INDEX "Transaction_walletAddress_idx" ON "Transaction"("walletAddress");
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");
CREATE INDEX "Transaction_timestamp_idx" ON "Transaction"("timestamp");

CREATE UNIQUE INDEX "Holder_launchId_walletAddress_key" ON "Holder"("launchId", "walletAddress");
CREATE INDEX "Holder_walletAddress_idx" ON "Holder"("walletAddress");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Holder" ADD CONSTRAINT "Holder_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
