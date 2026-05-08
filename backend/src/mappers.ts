import type { Launch, Transaction } from "@prisma/client";

export function launchStatus(launch: Launch): "upcoming" | "live" | "succeeded" | "failed" | "finalized" {
  if (launch.status === "migrated") return "finalized";
  return launch.status;
}

export function computeStatus(launch: Pick<Launch, "startTime" | "endTime" | "raisedTon" | "softCap" | "status">) {
  if (launch.status === "migrated") return "migrated";
  const now = Date.now();
  const start = launch.startTime.getTime();
  const end = launch.endTime.getTime();
  if (now < start) return "upcoming";
  if (now <= end) return "live";
  return launch.raisedTon >= launch.softCap ? "succeeded" : "failed";
}

export function launchToToken(launch: Launch) {
  return {
    id: launch.id,
    address: launch.tokenMasterAddress ?? launch.presalePoolAddress ?? launch.factoryAddress,
    presalePoolAddress: launch.presalePoolAddress,
    name: launch.tokenName,
    symbol: launch.symbol,
    description: launch.description,
    imageUrl: launch.logoUrl,
    metadataUrl: launch.metadataUrl,
    totalSupply: launch.totalSupply,
    decimals: launch.decimals,
    allocations: {
      presale: launch.presaleAllocation,
      liquidity: launch.liquidityAllocation,
      creator: launch.creatorAllocation,
    },
    presale: {
      rate: launch.presaleRate,
      softCap: launch.softCap,
      hardCap: launch.hardCap,
      raised: launch.raisedTon,
      contributors: 0,
      startTime: launch.startTime.toISOString(),
      endTime: launch.endTime.toISOString(),
      status: launchStatus(launch),
      minContribution: launch.minContribution ?? undefined,
      maxContribution: launch.maxContribution ?? undefined,
    },
    buyback: {
      enabled: launch.buybackPercent > 0,
      percent: launch.buybackPercent,
      rate: {
        percent: launch.buybackChunkPercent,
        intervalMinutes: Math.round(launch.buybackIntervalSeconds / 60),
      },
    },
    liquidityPercent: launch.liquidityPercent,
    social: asSocial(launch.social),
    creator: launch.creatorWallet,
    createdAt: launch.createdAt.toISOString(),
    price: 0,
    priceChange24h: 0,
    marketCap: 0,
    volume24h: 0,
    holders: 0,
    setupState: launch.pendingIndexing ? "preparing" : "ready",
  };
}

export function txToApi(tx: Transaction) {
  return {
    id: tx.id,
    hash: tx.txHash,
    kind: tx.type,
    amountTon: tx.amountTon,
    amountToken: tx.tokenAmount,
    timestamp: tx.timestamp.toISOString(),
    wallet: tx.walletAddress,
    tokenId: tx.launchId,
  };
}

function asSocial(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    website: typeof record.website === "string" ? record.website : undefined,
    twitter: typeof record.twitter === "string" ? record.twitter : undefined,
    telegram: typeof record.telegram === "string" ? record.telegram : undefined,
  };
}
