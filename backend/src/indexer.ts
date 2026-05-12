import { LaunchStatus, Prisma } from "@prisma/client";
import { Address, beginCell, Cell } from "@ton/core";
import { TonClient } from "@ton/ton";
import { config } from "./config";
import { prisma } from "./db";
import { computeStatus } from "./mappers";
import { addressVariants } from "./address";
import { buildPersistedAllocationFields } from "./allocation";

const NANO = 1_000_000_000;
const REFRESH_STALE_MS = 20_000;
const METHOD_DELAY_MS = 120;

type ReconcileMode = "fast" | "full";

export function startIndexer() {
  if (!config.indexerEnabled) {
    console.log("[indexer] disabled");
    return;
  }
  if (!config.factoryAddress) {
    console.log("[indexer] disabled: FACTORY_ADDRESS is missing");
    return;
  }

  const indexer = new TonpadIndexer();
  void indexer.tick();
  setInterval(() => void indexer.tick(), config.indexerIntervalMs).unref();
}

export async function reconcileFactoryLaunches(options: { mode?: ReconcileMode } = {}) {
  const indexer = new TonpadIndexer();
  const mode = options.mode ?? "full";
  await indexer.pollFactory({ mode });
  await indexer.refreshLaunches({
    maxLaunches: config.indexerRefreshLimit,
    includeHolders: mode === "full",
  });
}

class TonpadIndexer {
  private running = false;
  private client = new TonClient({
    endpoint: config.toncenterEndpoint,
    apiKey: config.toncenterApiKey || undefined,
  });

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      console.log("[indexer] tick start", {
        network: config.network,
        factoryAddress: config.factoryAddress,
        intervalMs: config.indexerIntervalMs,
        refreshLimit: config.indexerRefreshLimit,
      });
      await this.pollFactory({ mode: "full" });
      await this.refreshLaunches({
        maxLaunches: config.indexerRefreshLimit,
        includeHolders: true,
      });
      console.log("[indexer] tick complete");
    } catch (err) {
      console.warn("[indexer] tick failed", err);
    } finally {
      this.running = false;
    }
  }

  async pollFactory(options: { mode?: ReconcileMode; maxLaunches?: number } = {}) {
    const mode = options.mode ?? "full";
    const factory = Address.parse(config.factoryAddress);
    const countResult = await this.client.runMethod(factory, "getLaunchCount");
    const launchCount = Number(countResult.stack.readBigNumber());
    console.log("[indexer] factory launch count", {
      factory: config.factoryAddress,
      launchCount,
    });
    if (!Number.isFinite(launchCount) || launchCount <= 0) return;

    const launchIndexes = buildLaunchIndexes(
      launchCount,
      options.maxLaunches ??
        (mode === "fast" ? config.indexerFastPollLimit : config.indexerFullPollLimit),
    );

    for (const i of launchIndexes) {
      try {
        const result = await this.client.runMethod(factory, "getLaunch", [{ type: "int", value: BigInt(i) }]);
        const tokenMasterAddress = result.stack.readAddress().toString();
        const presalePoolAddress = result.stack.readAddress().toString();
        const creatorWallet = result.stack.readAddress().toString();
        const discoveredAt = new Date();

        const existing = await prisma.launch.findFirst({
          where: {
            factoryAddress: { in: addressVariants(config.factoryAddress) },
            OR: [
              { presalePoolAddress: { in: addressVariants(presalePoolAddress) } },
              { tokenMasterAddress: { in: addressVariants(tokenMasterAddress) } },
              { creatorWallet: { in: addressVariants(creatorWallet) }, pendingIndexing: true },
            ],
          },
          orderBy: { createdAt: "desc" },
        });

        if (existing) {
          const updated = await prisma.launch.update({
            where: { id: existing.id },
            data: {
              tokenMasterAddress,
              presalePoolAddress,
              creatorWallet,
              factoryAddress: config.factoryAddress,
              pendingIndexing: false,
            },
          });
          console.log("[indexer] reconciled launch", {
            id: updated.id,
            txHash: updated.txHash,
            creatorWallet,
            presalePoolAddress,
            tokenMasterAddress,
          });
          if ((mode === "full" || shouldRefreshLaunch(updated)) && updated.tokenMasterAddress && updated.presalePoolAddress) {
            await this.hydrateLaunch(updated, { includeHolders: false });
          }
          await pause(METHOD_DELAY_MS);
          continue;
        }

        const created = mode === "full"
          ? await this.createHydratedLaunch({
              index: i,
              discoveredAt,
              tokenMasterAddress,
              presalePoolAddress,
              creatorWallet,
            })
          : await this.createPlaceholderLaunch({
              index: i,
              discoveredAt,
              tokenMasterAddress,
              presalePoolAddress,
              creatorWallet,
            });
        console.log("[indexer] discovered launch", {
          id: created.id,
          presalePoolAddress,
          tokenMasterAddress,
          pendingIndexing: created.pendingIndexing,
        });
        await pause(METHOD_DELAY_MS);
      } catch (err) {
        console.warn(`[indexer] failed to read factory launch ${i}`, err);
        if (isRateLimitError(err)) {
          console.warn("[indexer] factory polling rate limited; stopping this pass");
          break;
        }
      }
    }
  }

  async refreshLaunches(options: { maxLaunches?: number; includeHolders?: boolean } = {}) {
    const staleBefore = new Date(Date.now() - REFRESH_STALE_MS);
    const launches = await prisma.launch.findMany({
      where: {
        ...currentFactoryLaunchWhere(),
        tokenMasterAddress: { not: null },
        presalePoolAddress: { not: null },
        OR: [{ pendingIndexing: true }, { lastIndexedAt: null }, { lastIndexedAt: { lt: staleBefore } }],
      },
      orderBy: [{ pendingIndexing: "desc" }, { lastIndexedAt: "asc" }, { createdAt: "desc" }],
      take: options.maxLaunches ?? config.indexerRefreshLimit,
    });

    for (const [index, launch] of launches.entries()) {
      try {
        await this.hydrateLaunch(launch, {
          includeHolders: !!options.includeHolders && index === 0,
        });
        await pause(METHOD_DELAY_MS);
      } catch (err) {
        console.warn("[indexer] failed to refresh launch", {
          launchId: launch.id,
          presalePoolAddress: launch.presalePoolAddress,
          err,
        });
        if (isRateLimitError(err)) {
          console.warn("[indexer] launch refresh rate limited; stopping this pass");
          break;
        }
      }
    }
  }

  private async createPlaceholderLaunch(args: {
    index: number;
    discoveredAt: Date;
    tokenMasterAddress: string;
    presalePoolAddress: string;
    creatorWallet: string;
  }) {
    return prisma.launch.create({
      data: {
        tokenName: `TONPad Launch ${args.index + 1}`,
        symbol: `TON${args.index + 1}`,
        description: "",
        logoUrl: "https://tonpad.org/icon.png",
        metadataUrl: null,
        creatorWallet: args.creatorWallet,
        factoryAddress: config.factoryAddress,
        tokenMasterAddress: args.tokenMasterAddress,
        presalePoolAddress: args.presalePoolAddress,
        softCap: 0,
        hardCap: 0,
        raisedTon: 0,
        liquidityPercent: 0,
        status: "upcoming",
        startTime: args.discoveredAt,
        endTime: new Date(args.discoveredAt.getTime() + 60 * 60 * 1000),
        totalSupply: 0,
        decimals: 9,
        presaleRate: 0,
        minContribution: null,
        maxContribution: null,
        presaleAllocation: 0,
        liquidityAllocation: 0,
        creatorAllocation: 0,
        platformTonTreasury: null,
        platformTokenTreasury: null,
        liquidityTreasury: null,
        platformTonFeeBps: 500,
        platformTokenFeeBps: 100,
        burnedTokens: 0,
        pendingIndexing: true,
      },
    });
  }

  private async createHydratedLaunch(args: {
    index: number;
    discoveredAt: Date;
    tokenMasterAddress: string;
    presalePoolAddress: string;
    creatorWallet: string;
  }) {
    const snapshot = await this.loadLaunchSnapshot({
      id: `factory-${args.index}`,
      factoryAddress: config.factoryAddress,
      tokenMasterAddress: args.tokenMasterAddress,
      presalePoolAddress: args.presalePoolAddress,
      creatorWallet: args.creatorWallet,
      tokenName: `TONPad Launch ${args.index + 1}`,
      symbol: `TON${args.index + 1}`,
      description: "",
      logoUrl: "https://tonpad.org/icon.png",
      metadataUrl: null,
      softCap: 0,
      hardCap: 0,
      raisedTon: 0,
      liquidityPercent: 0,
      startTime: args.discoveredAt,
      endTime: new Date(args.discoveredAt.getTime() + 60 * 60 * 1000),
      totalSupply: 0,
      decimals: 9,
      presaleRate: 0,
      minContribution: null,
      maxContribution: null,
      presaleAllocation: 0,
      liquidityAllocation: 0,
      creatorAllocation: 0,
      platformTonTreasury: null,
      platformTokenTreasury: null,
      liquidityTreasury: null,
      platformTonFeeBps: 500,
      platformTokenFeeBps: 100,
      burnedTokens: 0,
    });

    return prisma.launch.create({
      data: {
        tokenName: snapshot.tokenName,
        symbol: snapshot.symbol,
        description: snapshot.description,
        logoUrl: snapshot.logoUrl,
        metadataUrl: snapshot.metadataUrl,
        creatorWallet: args.creatorWallet,
        factoryAddress: config.factoryAddress,
        tokenMasterAddress: args.tokenMasterAddress,
        presalePoolAddress: args.presalePoolAddress,
        softCap: snapshot.softCap,
        hardCap: snapshot.hardCap,
        raisedTon: snapshot.raisedTon,
        liquidityPercent: snapshot.liquidityPercent,
        status: snapshot.status,
        startTime: snapshot.startTime,
        endTime: snapshot.endTime,
        totalSupply: snapshot.totalSupply,
        decimals: snapshot.decimals,
        presaleRate: snapshot.presaleRate,
        minContribution: snapshot.minContribution,
        maxContribution: snapshot.maxContribution,
        presaleAllocation: snapshot.presaleAllocation,
        liquidityAllocation: snapshot.liquidityAllocation,
        creatorAllocation: snapshot.creatorAllocation,
        presaleTokens: snapshot.presaleTokens,
        liquidityTokens: snapshot.liquidityTokens,
        creatorTokens: snapshot.creatorTokens,
        presaleTON: snapshot.presaleTON,
        liquidityTON: snapshot.liquidityTON,
        platformFeeTON: snapshot.platformFeeTON,
        creatorTON: snapshot.creatorTON,
        platformTonTreasury: snapshot.platformTonTreasury,
        platformTokenTreasury: snapshot.platformTokenTreasury,
        liquidityTreasury: snapshot.liquidityTreasury,
        platformTonFeeBps: snapshot.platformTonFeeBps,
        platformTokenFeeBps: snapshot.platformTokenFeeBps,
        platformTokenFeeAmount: snapshot.platformTokenFeeAmount,
        platformTokenFeeTonTreasuryShare: snapshot.platformTokenFeeTonTreasuryShare,
        platformTokenFeeTokenTreasuryShare: snapshot.platformTokenFeeTokenTreasuryShare,
        liquidityTonAmount: snapshot.liquidityTonAmount,
        creatorTreasuryAmount: snapshot.creatorTreasuryAmount,
        burnedTokens: snapshot.burnedTokens,
        pendingIndexing: false,
        lastIndexedAt: args.discoveredAt,
      },
    });
  }

  private async hydrateLaunch(
    launch: Parameters<TonpadIndexer["loadLaunchSnapshot"]>[0] & { id: string },
    options: { includeHolders: boolean },
  ) {
    const snapshot = await this.loadLaunchSnapshot(launch);
    const updated = await prisma.launch.update({
      where: { id: launch.id },
      data: {
        tokenName: snapshot.tokenName,
        symbol: snapshot.symbol,
        description: snapshot.description,
        logoUrl: snapshot.logoUrl,
        metadataUrl: snapshot.metadataUrl,
        creatorWallet: snapshot.creatorWallet,
        tokenMasterAddress: snapshot.tokenMasterAddress,
        presalePoolAddress: snapshot.presalePoolAddress,
        softCap: snapshot.softCap,
        hardCap: snapshot.hardCap,
        raisedTon: snapshot.raisedTon,
        liquidityPercent: snapshot.liquidityPercent,
        status: snapshot.status,
        startTime: snapshot.startTime,
        endTime: snapshot.endTime,
        totalSupply: snapshot.totalSupply,
        decimals: snapshot.decimals,
        presaleRate: snapshot.presaleRate,
        minContribution: snapshot.minContribution,
        maxContribution: snapshot.maxContribution,
        presaleAllocation: snapshot.presaleAllocation,
        liquidityAllocation: snapshot.liquidityAllocation,
        creatorAllocation: snapshot.creatorAllocation,
        presaleTokens: snapshot.presaleTokens,
        liquidityTokens: snapshot.liquidityTokens,
        creatorTokens: snapshot.creatorTokens,
        presaleTON: snapshot.presaleTON,
        liquidityTON: snapshot.liquidityTON,
        platformFeeTON: snapshot.platformFeeTON,
        creatorTON: snapshot.creatorTON,
        platformTonTreasury: snapshot.platformTonTreasury,
        platformTokenTreasury: snapshot.platformTokenTreasury,
        liquidityTreasury: snapshot.liquidityTreasury,
        platformTonFeeBps: snapshot.platformTonFeeBps,
        platformTokenFeeBps: snapshot.platformTokenFeeBps,
        platformTokenFeeAmount: snapshot.platformTokenFeeAmount,
        platformTokenFeeTonTreasuryShare: snapshot.platformTokenFeeTonTreasuryShare,
        platformTokenFeeTokenTreasuryShare: snapshot.platformTokenFeeTokenTreasuryShare,
        liquidityTonAmount: snapshot.liquidityTonAmount,
        creatorTreasuryAmount: snapshot.creatorTreasuryAmount,
        burnedTokens: snapshot.burnedTokens,
        pendingIndexing: false,
        lastIndexedAt: new Date(),
      },
    });
    if (options.includeHolders) {
      await this.refreshHolders(updated);
    }
    console.log("[indexer] launch updated", {
      id: updated.id,
      raisedTon: updated.raisedTon,
      presalePoolAddress: updated.presalePoolAddress,
      tokenMasterAddress: updated.tokenMasterAddress,
      status: updated.status,
    });
    return updated;
  }

  private async loadLaunchSnapshot(launch: {
    id: string;
    factoryAddress: string;
    tokenMasterAddress: string | null;
    presalePoolAddress: string | null;
    creatorWallet: string;
    tokenName: string;
    symbol: string;
    description: string;
    logoUrl: string | null;
    metadataUrl: string | null;
    softCap: number;
    hardCap: number;
    raisedTon: number;
    liquidityPercent: number;
    startTime: Date;
    endTime: Date;
    totalSupply: number;
    decimals: number;
    presaleRate: number;
    minContribution: number | null;
    maxContribution: number | null;
    presaleAllocation: number;
    liquidityAllocation: number;
    creatorAllocation: number;
    platformTonTreasury: string | null;
    platformTokenTreasury: string | null;
    liquidityTreasury: string | null;
    platformTonFeeBps: number;
    platformTokenFeeBps: number;
    burnedTokens: number;
  }) {
    if (!launch.tokenMasterAddress || !launch.presalePoolAddress) {
      throw new Error("Launch snapshot requires token and pool addresses");
    }
    const factory = Address.parse(launch.factoryAddress);
    const pool = Address.parse(launch.presalePoolAddress);
    const token = Address.parse(launch.tokenMasterAddress);

    const poolConfig = await this.client.runMethod(pool, "getConfig");
    await pause(METHOD_DELAY_MS);
    const poolState = await this.client.runMethod(pool, "getState");
    await pause(METHOD_DELAY_MS);
    const tokenMeta = await this.client.runMethod(token, "getTokenMetadata");
    await pause(METHOD_DELAY_MS);
    const effectiveTreasuries = await this.client.runMethod(factory, "getEffectiveTreasuries", [
      { type: "slice", cell: beginCell().storeAddress(pool).endCell() },
    ]);

    const configStack = poolConfig.stack;
    const stateStack = poolState.stack;
    const tokenStack = tokenMeta.stack;
    const treasuryStack = effectiveTreasuries.stack;

    const poolFactory = configStack.readAddress().toString();
    const creatorWallet = configStack.readAddress().toString();
    const tokenMasterAddress = configStack.readAddress().toString();
    const treasuryAddress = configStack.readAddress().toString();
    const platformTonFeeBps = Number(configStack.readBigNumber());
    const platformTokenFeeBps = Number(configStack.readBigNumber());
    const presaleRateRaw = configStack.readBigNumber();
    const softCap = fromNano(configStack.readBigNumber());
    const hardCap = fromNano(configStack.readBigNumber());
    const minContribution = fromNano(configStack.readBigNumber());
    const maxContribution = fromNano(configStack.readBigNumber());
    const startTime = new Date(Number(configStack.readBigNumber()) * 1000);
    const endTime = new Date(Number(configStack.readBigNumber()) * 1000);
    const liquidityPercentOfRaised = Number(configStack.readBigNumber()) / 100;
    const presaleTokenAllocationRaw = configStack.readBigNumber();
    const buyerTokenAllocationRaw = configStack.readBigNumber();
    const platformTokenFeeRaw = configStack.readBigNumber();
    const platformTokenFeeTonShareRaw = configStack.readBigNumber();
    const platformTokenFeeTokenShareRaw = configStack.readBigNumber();
    const liquidityTokenAllocationRaw = configStack.readBigNumber();
    const totalSupplyRaw = configStack.readBigNumber();

    const totalRaised = fromNano(stateStack.readBigNumber());
    stateStack.readBigNumber(); // totalSold
    const finalized = stateStack.readBoolean();
    const failed = stateStack.readBoolean();
    const cancelled = stateStack.readBoolean();
    stateStack.readBoolean(); // paused
    stateStack.readBoolean(); // treasuryClaimed
    stateStack.readBoolean(); // platformTonFeePaid
    const platformTonFee = fromNano(stateStack.readBigNumber());
    const liquidityTonAmount = fromNano(stateStack.readBigNumber());
    const creatorTreasuryAmount = fromNano(stateStack.readBigNumber());
    stateStack.readBoolean(); // tokenFeesRouted
    const burnedTokensRaw = readOptionalBigNumber(stateStack, 0n);

    tokenStack.readAddress(); // factory
    const tokenName = tokenStack.readString();
    const symbol = tokenStack.readString();
    const description = tokenStack.readString();
    const metadataCell = tokenStack.readCell();
    const totalSupply = fromTokenUnits(totalSupplyRaw, Number(tokenStack.readBigNumber()));
    const decimals = Number(tokenStack.readBigNumber());
    const metadataUrl = readOffchainMetadataUrl(metadataCell);

    const platformTonTreasury = treasuryStack.readAddress().toString();
    const platformTokenTreasury = treasuryStack.readAddress().toString();
    const liquidityTreasury = treasuryStack.readAddress().toString();
    const liquidityTreasurySet = treasuryStack.readBoolean();

    const presaleAllocation = percentageOfTotal(presaleTokenAllocationRaw, totalSupplyRaw);
    const liquidityAllocation = percentageOfTotal(liquidityTokenAllocationRaw, totalSupplyRaw);
    const creatorAllocation = percentageOfTotal(
      totalSupplyRaw - presaleTokenAllocationRaw - liquidityTokenAllocationRaw,
      totalSupplyRaw,
    );
    const status: LaunchStatus = cancelled
      ? "failed"
      : finalized
        ? "succeeded"
        : computeStatus({
            startTime,
            endTime,
            raisedTon: totalRaised,
            softCap,
            hardCap,
            status: failed ? "failed" : "upcoming",
          });
    const allocationFields = buildPersistedAllocationFields({
      totalSupply,
      presalePercent: presaleAllocation,
      liquidityPercentTokens: liquidityAllocation,
      creatorPercent: creatorAllocation,
      totalRaisedTon: totalRaised,
      liquidityPercentOfRaised,
      platformTonFeeBps,
      platformTokenFeeBps,
      liquidityTreasurySet,
      burnedTokens: fromTokenUnits(burnedTokensRaw, decimals),
    });

    return {
      factoryAddress: poolFactory,
      creatorWallet,
      tokenMasterAddress,
      presalePoolAddress: launch.presalePoolAddress,
      treasuryAddress,
      tokenName: tokenName || launch.tokenName,
      symbol: (symbol || launch.symbol).toUpperCase(),
      description: description || launch.description,
      logoUrl: launch.logoUrl ?? "https://tonpad.org/icon.png",
      metadataUrl: launch.metadataUrl ?? metadataUrl,
      softCap,
      hardCap,
      raisedTon: totalRaised,
      liquidityPercent: liquidityPercentOfRaised,
      status,
      startTime,
      endTime,
      totalSupply,
      decimals,
      presaleRate: fromTokenUnits(presaleRateRaw, decimals),
      minContribution,
      maxContribution,
      presaleAllocation,
      liquidityAllocation,
      creatorAllocation,
      presaleTokens: allocationFields.presaleTokens,
      liquidityTokens: allocationFields.liquidityTokens,
      creatorTokens: allocationFields.creatorTokens,
      presaleTON: allocationFields.presaleTON,
      liquidityTON: allocationFields.liquidityTON,
      platformFeeTON: allocationFields.platformFeeTON,
      creatorTON: allocationFields.creatorTON,
      platformTonTreasury,
      platformTokenTreasury,
      liquidityTreasury: liquidityTreasurySet ? liquidityTreasury : null,
      platformTonFeeBps,
      platformTokenFeeBps,
      burnedTokens: fromTokenUnits(burnedTokensRaw, decimals),
      platformTokenFeeAmount: fromTokenUnits(platformTokenFeeRaw, decimals),
      platformTokenFeeTonTreasuryShare: fromTokenUnits(platformTokenFeeTonShareRaw, decimals),
      platformTokenFeeTokenTreasuryShare: fromTokenUnits(platformTokenFeeTokenShareRaw, decimals),
      liquidityTonAmount,
      creatorTreasuryAmount,
      platformTonFee,
    };
  }

  private async refreshHolders(launch: {
    id: string;
    creatorWallet: string;
    tokenMasterAddress: string | null;
    platformTonTreasury: string | null;
    platformTokenTreasury: string | null;
    liquidityTreasury: string | null;
    decimals: number;
  }) {
    if (!launch.tokenMasterAddress) return;
    const token = Address.parse(launch.tokenMasterAddress);
    const candidateWallets = new Set<string>([
      ...addressVariants(launch.creatorWallet),
      ...addressVariants(launch.platformTonTreasury),
      ...addressVariants(launch.platformTokenTreasury),
      ...addressVariants(launch.liquidityTreasury),
    ]);

    const participantWallets = await prisma.transaction.findMany({
      where: { launchId: launch.id },
      select: { walletAddress: true },
      distinct: ["walletAddress"],
    });
    for (const item of participantWallets) {
      for (const variant of addressVariants(item.walletAddress)) {
        candidateWallets.add(variant);
      }
    }

    for (const wallet of candidateWallets) {
      try {
        const owner = Address.parse(wallet);
        const walletAddress = await this.getJettonWalletAddress(token, owner);
        const balance = await this.getJettonWalletBalance(walletAddress);
        await prisma.holder.upsert({
          where: { launchId_walletAddress: { launchId: launch.id, walletAddress: owner.toString() } },
          create: {
            launchId: launch.id,
            walletAddress: owner.toString(),
            tokenBalance: fromTokenUnits(balance, launch.decimals),
          },
          update: {
            tokenBalance: fromTokenUnits(balance, launch.decimals),
          },
        });
      } catch (err) {
        console.warn("[indexer] holder refresh failed", { launchId: launch.id, wallet, err });
      }
    }
  }

  private async getJettonWalletAddress(token: Address, owner: Address) {
    const result = await this.client.runMethod(token, "get_wallet_address", [
      { type: "slice", cell: beginCell().storeAddress(owner).endCell() },
    ]);
    return result.stack.readAddress();
  }

  private async getJettonWalletBalance(walletAddress: Address) {
    const result = await this.client.runMethod(walletAddress, "get_wallet_data");
    return result.stack.readBigNumber();
  }
}

function buildLaunchIndexes(launchCount: number, maxLaunches: number) {
  const indexes: number[] = [];
  for (let i = launchCount - 1; i >= 0 && indexes.length < maxLaunches; i -= 1) {
    indexes.push(i);
  }
  return indexes;
}

function shouldRefreshLaunch(launch: { pendingIndexing: boolean; lastIndexedAt: Date | null }) {
  if (launch.pendingIndexing) return true;
  if (!launch.lastIndexedAt) return true;
  return Date.now() - launch.lastIndexedAt.getTime() >= REFRESH_STALE_MS;
}

function isRateLimitError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("429") || message.toLowerCase().includes("ratelimit");
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentFactoryLaunchWhere(): Prisma.LaunchWhereInput {
  if (!config.factoryAddress) return {};
  return { factoryAddress: { in: addressVariants(config.factoryAddress) } };
}

function fromNano(value: bigint) {
  return Number(value) / NANO;
}

function fromTokenUnits(value: bigint, decimals: number) {
  return Number(value) / 10 ** decimals;
}

function percentageOfTotal(part: bigint, total: bigint) {
  if (total === 0n) return 0;
  return Number((part * 10000n) / total) / 100;
}

function readOffchainMetadataUrl(cell: Cell) {
  try {
    const slice = cell.beginParse();
    const kind = slice.loadUint(8);
    if (kind !== 1) return null;
    return slice.loadStringTail();
  } catch {
    return null;
  }
}

function readOptionalBigNumber(
  stack: {
    readBigNumber: () => bigint;
  },
  fallback: bigint,
) {
  try {
    return stack.readBigNumber();
  } catch {
    return fallback;
  }
}
