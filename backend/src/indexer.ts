import { LaunchStatus, Prisma } from "@prisma/client";
import { Address, beginCell, Cell } from "@ton/core";
import { TonClient } from "@ton/ton";
import { config } from "./config";
import { prisma } from "./db";
import { computeStatus } from "./mappers";
import { addressVariants } from "./address";

const NANO = 1_000_000_000;

export function startIndexer() {
  if (!config.indexerEnabled) {
    console.log("[indexer] disabled");
    return;
  }

  const indexer = new TonpadIndexer();
  void indexer.tick();
  setInterval(() => void indexer.tick(), config.indexerIntervalMs).unref();
}

export async function reconcileFactoryLaunches() {
  const indexer = new TonpadIndexer();
  await indexer.pollFactory();
  await indexer.refreshLaunches();
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
      });
      await this.pollFactory();
      await this.refreshLaunches();
      console.log("[indexer] tick complete");
    } catch (err) {
      console.warn("[indexer] tick failed", err);
    } finally {
      this.running = false;
    }
  }

  async pollFactory() {
    const factory = Address.parse(config.factoryAddress);
    const countResult = await this.client.runMethod(factory, "getLaunchCount");
    const launchCount = Number(countResult.stack.readBigNumber());
    console.log("[indexer] factory launch count", {
      factory: config.factoryAddress,
      launchCount,
    });
    if (!Number.isFinite(launchCount) || launchCount <= 0) return;

    for (let i = 0; i < launchCount; i += 1) {
      try {
        const result = await this.client.runMethod(factory, "getLaunch", [{ type: "int", value: BigInt(i) }]);
        const tokenMasterAddress = result.stack.readAddress().toString();
        const presalePoolAddress = result.stack.readAddress().toString();
        const creatorWallet = result.stack.readAddress().toString();
        const discoveredAt = new Date();

        const existing = await prisma.launch.findFirst({
          where: {
            factoryAddress: config.factoryAddress,
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
          lastIndexedAt: discoveredAt,
          social: Prisma.JsonNull,
        },
          });
          console.log("[indexer] reconciled launch", {
            id: updated.id,
            txHash: updated.txHash,
            creatorWallet,
            presalePoolAddress,
            tokenMasterAddress,
          });
          continue;
        }

        const snapshot = await this.loadLaunchSnapshot({
          id: `factory-${i}`,
          factoryAddress: config.factoryAddress,
          tokenMasterAddress,
          presalePoolAddress,
          creatorWallet,
          tokenName: `TONPad Launch ${i + 1}`,
          symbol: `TON${i + 1}`,
          description: "",
          logoUrl: "https://tonpad.org/icon.png",
          metadataUrl: null,
          softCap: 0,
          hardCap: 0,
          raisedTon: 0,
          liquidityPercent: 0,
          startTime: discoveredAt,
          endTime: new Date(discoveredAt.getTime() + 60 * 60 * 1000),
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
        });

        const created = await prisma.launch.create({
          data: {
            tokenName: snapshot.tokenName,
            symbol: snapshot.symbol,
            description: snapshot.description,
            logoUrl: snapshot.logoUrl,
            metadataUrl: snapshot.metadataUrl,
            creatorWallet,
            factoryAddress: config.factoryAddress,
            tokenMasterAddress,
            presalePoolAddress,
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
            pendingIndexing: false,
            lastIndexedAt: discoveredAt,
          },
        });
        console.log("[indexer] discovered launch", {
          id: created.id,
          presalePoolAddress,
          tokenMasterAddress,
        });
      } catch (err) {
        console.warn(`[indexer] failed to read factory launch ${i}`, err);
      }
    }
  }

  async refreshLaunches() {
    const launches = await prisma.launch.findMany({
      where: currentFactoryLaunchWhere(),
      orderBy: { createdAt: "asc" },
    });

    for (const launch of launches) {
      try {
        if (!launch.presalePoolAddress || !launch.tokenMasterAddress) continue;
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
            pendingIndexing: false,
            lastIndexedAt: new Date(),
          },
        });
        await this.refreshHolders(updated);
        console.log("[indexer] launch updated", {
          id: updated.id,
          raisedTon: updated.raisedTon,
          presalePoolAddress: updated.presalePoolAddress,
          tokenMasterAddress: updated.tokenMasterAddress,
          status: updated.status,
        });
      } catch (err) {
        console.warn("[indexer] failed to refresh launch", {
          launchId: launch.id,
          presalePoolAddress: launch.presalePoolAddress,
          err,
        });
      }
    }
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
  }) {
    if (!launch.tokenMasterAddress || !launch.presalePoolAddress) {
      throw new Error("Launch snapshot requires token and pool addresses");
    }
    const factory = Address.parse(launch.factoryAddress);
    const pool = Address.parse(launch.presalePoolAddress);
    const token = Address.parse(launch.tokenMasterAddress);

    const [poolConfig, poolState, tokenMeta, effectiveTreasuries] = await Promise.all([
      this.client.runMethod(pool, "getConfig"),
      this.client.runMethod(pool, "getState"),
      this.client.runMethod(token, "getTokenMetadata"),
      this.client.runMethod(factory, "getEffectiveTreasuries", [
        { type: "slice", cell: beginCell().storeAddress(pool).endCell() },
      ]),
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
            status: failed ? "failed" : "upcoming",
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
      platformTonTreasury,
      platformTokenTreasury,
      liquidityTreasury: liquidityTreasurySet ? liquidityTreasury : null,
      platformTonFeeBps,
      platformTokenFeeBps,
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

function currentFactoryLaunchWhere(): Prisma.LaunchWhereInput {
  return { factoryAddress: config.factoryAddress };
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
