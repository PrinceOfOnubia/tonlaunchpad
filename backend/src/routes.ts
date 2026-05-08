import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { config } from "./config";
import { prisma } from "./db";
import { computeStatus, launchToToken, txToApi } from "./mappers";
import { createLaunchSchema, listQuerySchema, tonAddressSchema } from "./validation";

export const router = Router();
mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    cb(null, file.mimetype.startsWith("image/"));
  },
});
const reroute = (req: Request, res: Response, next: NextFunction, url: string) => {
  req.url = url;
  (router as unknown as { handle: (req: Request, res: Response, next: NextFunction) => void }).handle(
    req,
    res,
    next,
  );
};

router.get("/health", (_req, res) => {
  res.json({ ok: true, network: config.network, indexedFactory: config.factoryAddress });
});

router.post("/api/upload/image", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Image file is required" });
  const extension = safeExtension(req.file.originalname, req.file.mimetype);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
  writeFileSync(join(config.uploadDir, fileName), req.file.buffer);
  res.status(201).json({ url: publicUrl(req, `/uploads/${fileName}`) });
});

router.post("/api/metadata", (req, res) => {
  const metadata = {
    name: String(req.body?.name ?? "TONPad Token"),
    symbol: String(req.body?.symbol ?? "TKN"),
    description: String(req.body?.description ?? ""),
    decimals: Number(req.body?.decimals ?? 9),
    image: String(req.body?.imageUrl ?? "https://tonlaunchpad.vercel.app/icon.png"),
  };
  const fileName = `${Date.now()}-${metadata.symbol.toLowerCase().replace(/[^a-z0-9]/g, "") || "token"}.json`;
  writeFileSync(join(config.uploadDir, fileName), JSON.stringify(metadata, null, 2));
  res.status(201).json({ url: publicUrl(req, `/uploads/${fileName}`) });
});

router.get("/api/launches", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    try {
      await refreshStatuses();
    } catch (err) {
      console.warn("[api] status refresh skipped", err);
    }

    const where: Prisma.LaunchWhereInput = {};
    if (query.status !== "all" && query.status !== "trending") {
      where.status =
        query.status === "succeeded" || query.status === "concluded"
          ? { in: ["succeeded", "migrated"] }
          : query.status;
    }
    if (query.search) {
      where.OR = [
        { tokenName: { contains: query.search, mode: "insensitive" } },
        { symbol: { contains: query.search, mode: "insensitive" } },
        { tokenMasterAddress: { contains: query.search, mode: "insensitive" } },
        { presalePoolAddress: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const sort = query.sort ?? query.sortBy ?? "newest";
    const orderBy = orderByFor(sort, query.status === "trending");
    const [total, launches] = await safeDb(
      () =>
        Promise.all([
          prisma.launch.count({ where }),
          prisma.launch.findMany({
            where,
            orderBy,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
        ]),
      [0, []] as const,
    );

    const contributorCounts = await safeDb(
      () => contributorCountByLaunch(launches.map((launch) => launch.id)),
      new Map<string, number>(),
    );
    console.log("[api] GET /api/launches", {
      status: query.status,
      search: query.search || undefined,
      total,
      returned: launches.length,
    });
    res.json({
      items: launches.map((launch) => ({
        ...launchToToken(launch),
        presale: {
          ...launchToToken(launch).presale,
          contributors: contributorCounts.get(launch.id) ?? 0,
        },
      })),
      total,
      page: query.page,
      limit: query.limit,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/api/launches/:id", async (req, res, next) => {
  try {
    const launch = await prisma.launch.findFirst({
      where: {
        OR: [
          { id: req.params.id },
          { tokenMasterAddress: req.params.id },
          { presalePoolAddress: req.params.id },
          { txHash: req.params.id },
        ],
      },
    });
    if (!launch) return res.status(404).json({ message: "Launch not found" });

    const contributors = await prisma.transaction.groupBy({
      by: ["walletAddress"],
      where: { launchId: launch.id, type: "contribute" },
    });
    res.json({
      ...launchToToken(launch),
      presale: { ...launchToToken(launch).presale, contributors: contributors.length },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/api/launches", async (req, res, next) => {
  try {
    const body = createLaunchSchema.parse(req.body);
    const creatorWallet = body.creatorWallet ?? body.creator;
    if (!creatorWallet) return res.status(400).json({ message: "creatorWallet is required" });
    console.log("[api] POST /api/launches received", {
      name: body.name,
      symbol: body.symbol,
      creatorWallet,
      hasPool: !!body.presalePoolAddress,
      hasToken: !!body.tokenMasterAddress,
      hasTxHash: !!body.txHash,
      hasBoc: !!body.transactionBoc,
    });

    const factoryAddress = body.factoryAddress ?? config.factoryAddress;
    const dexAdapterAddress = body.dexAdapterAddress ?? config.dexAdapterAddress;
    const status = computeStatus({
      startTime: body.presale.startTime,
      endTime: body.presale.endTime,
      raisedTon: 0,
      softCap: body.presale.softCap,
      status: "upcoming",
    });

    const launch = await prisma.launch.upsert({
      where: { txHash: body.txHash ?? `frontend-${Date.now()}-${body.symbol}` },
      create: {
        tokenName: body.name,
        symbol: body.symbol.toUpperCase(),
        description: body.description,
        logoUrl: body.logoUrl ?? body.imageUrl ?? null,
        metadataUrl: body.metadataUrl ?? null,
        creatorWallet,
        factoryAddress,
        tokenMasterAddress: body.tokenMasterAddress ?? null,
        presalePoolAddress: body.presalePoolAddress ?? null,
        dexAdapterAddress,
        txHash: body.txHash,
        softCap: body.presale.softCap,
        hardCap: body.presale.hardCap,
        liquidityPercent: body.liquidityPercent,
        buybackPercent: body.buyback.enabled ? body.buyback.percent : 0,
        buybackChunkPercent: body.buyback.enabled ? body.buyback.rate.percent : 0,
        buybackIntervalSeconds: Math.round(body.buyback.rate.intervalMinutes * 60),
        status,
        startTime: body.presale.startTime,
        endTime: body.presale.endTime,
        totalSupply: body.totalSupply,
        decimals: body.decimals,
        presaleRate: body.presale.rate,
        minContribution: body.presale.minContribution,
        maxContribution: body.presale.maxContribution,
        presaleAllocation: body.allocations.presale,
        liquidityAllocation: body.allocations.liquidity,
        creatorAllocation: body.allocations.creator,
        social: body.social,
        pendingIndexing: !(body.tokenMasterAddress && body.presalePoolAddress),
      },
      update: {
        logoUrl: body.logoUrl ?? body.imageUrl ?? undefined,
        metadataUrl: body.metadataUrl ?? undefined,
        tokenMasterAddress: body.tokenMasterAddress ?? undefined,
        presalePoolAddress: body.presalePoolAddress ?? undefined,
        pendingIndexing:
          body.tokenMasterAddress && body.presalePoolAddress ? false : undefined,
        status,
        social: body.social,
      },
    });

    if (body.txHash) {
      await prisma.transaction.upsert({
        where: { txHash: body.txHash },
        create: {
          launchId: launch.id,
          walletAddress: creatorWallet,
          txHash: body.txHash,
          type: "launch",
          timestamp: launch.createdAt,
        },
        update: { launchId: launch.id, walletAddress: creatorWallet },
      });
    }

    await updateStatsCache();
    console.log("[api] POST /api/launches saved", {
      id: launch.id,
      symbol: launch.symbol,
      pendingIndexing: launch.pendingIndexing,
    });
    res.status(201).json(launchToToken(launch));
  } catch (err) {
    console.error("[api] POST /api/launches failed", err);
    next(err);
  }
});

router.get("/api/stats", async (_req, res, next) => {
  try {
    const stats = await safeDb(() => updateStatsCache(), null);
    if (!stats) {
      res.json(emptyStats("Indexer temporarily unavailable"));
      return;
    }
    res.json({
      tokensLaunched: stats.tokensLaunched,
      totalLiquidity: stats.totalLiquidityTon,
      activeHolders: stats.activeHolders,
      volume24h: stats.volume24hTon,
      totalTokens: stats.tokensLaunched,
      totalLiquidityTon: stats.totalLiquidityTon,
      totalUsers: stats.activeHolders,
      totalVolumeTon: stats.volume24hTon,
      note: stats.volume24hTon === 0 ? "DEX volume indexing soon" : undefined,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/api/profile/:wallet", async (req, res, next) => {
  try {
    const wallet = tonAddressSchema.parse(req.params.wallet);
    const data = await safeDb(
      () =>
        Promise.all([
          prisma.launch.findMany({ where: { creatorWallet: wallet }, orderBy: { createdAt: "desc" } }),
          prisma.holder.findMany({ where: { walletAddress: wallet, tokenBalance: { gt: 0 } }, include: { launch: true } }),
          prisma.transaction.findMany({ where: { walletAddress: wallet }, orderBy: { timestamp: "desc" }, take: 100 }),
          prisma.transaction.findMany({
            where: { walletAddress: wallet, type: "contribute" },
            include: { launch: true },
            orderBy: { timestamp: "desc" },
          }),
        ]),
      null,
    );
    if (!data) {
      res.json(emptyProfile(wallet, "Indexer temporarily unavailable"));
      return;
    }
    const [created, holders, transactions, contributions] = data;

    const claimable = contributions
      .filter((tx) => tx.launch.status === "succeeded" || tx.launch.status === "migrated")
      .map((tx) => ({ launch: launchToToken(tx.launch), amountTon: tx.amountTon }));
    const refundable = contributions
      .filter((tx) => tx.launch.status === "failed")
      .map((tx) => ({ launch: launchToToken(tx.launch), amountTon: tx.amountTon }));

    const holdings = holders.map((holder) => ({
      tokenId: holder.launchId,
      symbol: holder.launch.symbol,
      name: holder.launch.tokenName,
      imageUrl: holder.launch.logoUrl,
      amount: holder.tokenBalance,
      valueTon: 0,
      pnlPercent: 0,
    }));

    res.json({
      wallet,
      createdTokens: created.map(launchToToken),
      contributions: contributions.map((tx) => ({ launch: launchToToken(tx.launch), transaction: txToApi(tx) })),
      transactions: transactions.map(txToApi),
      claimable,
      refundable,
      portfolio: {
        wallet,
        totalValueTon: 0,
        pnlPercent: 0,
        holdings,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/api/transactions/:wallet", async (req, res, next) => {
  try {
    const wallet = tonAddressSchema.parse(req.params.wallet);
    const transactions = await safeDb(
      () =>
        prisma.transaction.findMany({
          where: { walletAddress: wallet },
          orderBy: { timestamp: "desc" },
          take: 100,
        }),
      [],
    );
    res.json(transactions.map(txToApi));
  } catch (err) {
    next(err);
  }
});

// Compatibility routes for the existing frontend API client shape.
router.get("/api/tokens", (req, res, next) => {
  reroute(req, res, next, `/api/launches${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
});
router.get("/api/tokens/trending", (req, res, next) => {
  reroute(req, res, next, "/api/launches?status=trending");
});
router.get("/api/tokens/:id", (req, res, next) => {
  reroute(req, res, next, `/api/launches/${req.params.id}`);
});
router.post("/api/tokens", (req, res, next) => {
  reroute(req, res, next, "/api/launches");
});
router.get("/api/users/:wallet/portfolio", async (req, res, next) => {
  try {
    const wallet = tonAddressSchema.parse(req.params.wallet);
    const holders = await safeDb(
      () =>
        prisma.holder.findMany({
          where: { walletAddress: wallet, tokenBalance: { gt: 0 } },
          include: { launch: true },
        }),
      [],
    );
    res.json({
      wallet,
      totalValueTon: 0,
      pnlPercent: 0,
      holdings: holders.map((holder) => ({
        tokenId: holder.launchId,
        symbol: holder.launch.symbol,
        name: holder.launch.tokenName,
        imageUrl: holder.launch.logoUrl,
        amount: holder.tokenBalance,
        valueTon: 0,
        pnlPercent: 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});
router.get("/api/users/:wallet/created", async (req, res, next) => {
  try {
    const wallet = tonAddressSchema.parse(req.params.wallet);
    const created = await safeDb(
      () => prisma.launch.findMany({ where: { creatorWallet: wallet } }),
      [],
    );
    res.json(created.map(launchToToken));
  } catch (err) {
    next(err);
  }
});
router.get("/api/users/:wallet/transactions", (req, res, next) => {
  reroute(req, res, next, `/api/transactions/${req.params.wallet}`);
});

async function refreshStatuses() {
  const launches = await prisma.launch.findMany({
    where: { status: { not: "migrated" } },
  });
  await Promise.all(
    launches.map((launch) => {
      const status = computeStatus(launch);
      return status !== launch.status
        ? prisma.launch.update({ where: { id: launch.id }, data: { status } })
        : Promise.resolve(launch);
    }),
  );
}

async function contributorCountByLaunch(launchIds: string[]) {
  if (launchIds.length === 0) return new Map<string, number>();
  const groups = await prisma.transaction.groupBy({
    by: ["launchId", "walletAddress"],
    where: { launchId: { in: launchIds }, type: "contribute" },
  });
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group.launchId, (counts.get(group.launchId) ?? 0) + 1);
  return counts;
}

async function updateStatsCache() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [tokensLaunched, totalLiquidity, activeHolders, volume] = await Promise.all([
    prisma.launch.count(),
    prisma.launch.aggregate({ _sum: { raisedTon: true } }),
    prisma.holder.groupBy({ by: ["walletAddress"], where: { tokenBalance: { gt: 0 } } }),
    prisma.transaction.aggregate({
      where: { timestamp: { gte: dayAgo }, type: { in: ["contribute", "migrate", "buyback"] } },
      _sum: { amountTon: true },
    }),
  ]);
  return prisma.statsCache.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      tokensLaunched,
      totalLiquidityTon: totalLiquidity._sum.raisedTon ?? 0,
      activeHolders: activeHolders.length,
      volume24hTon: volume._sum.amountTon ?? 0,
    },
    update: {
      tokensLaunched,
      totalLiquidityTon: totalLiquidity._sum.raisedTon ?? 0,
      activeHolders: activeHolders.length,
      volume24hTon: volume._sum.amountTon ?? 0,
    },
  });
}

function orderByFor(sort: string, trending: boolean): Prisma.LaunchOrderByWithRelationInput[] {
  if (trending) return [{ raisedTon: "desc" }, { updatedAt: "desc" }];
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }];
    case "liquidity":
      return [{ raisedTon: "desc" }];
    case "volume":
    case "volume24h":
    case "raised":
      return [{ raisedTon: "desc" }, { updatedAt: "desc" }];
    default:
      return [{ createdAt: "desc" }];
  }
}

async function safeDb<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    console.error("[api] database unavailable", err);
    return fallback;
  }
}

function emptyStats(note: string) {
  return {
    tokensLaunched: 0,
    totalLiquidity: 0,
    activeHolders: 0,
    volume24h: 0,
    totalTokens: 0,
    totalLiquidityTon: 0,
    totalUsers: 0,
    totalVolumeTon: 0,
    note,
  };
}

function emptyProfile(wallet: string, note: string) {
  return {
    wallet,
    createdTokens: [],
    contributions: [],
    transactions: [],
    claimable: [],
    refundable: [],
    portfolio: {
      wallet,
      totalValueTon: 0,
      pnlPercent: 0,
      holdings: [],
    },
    note,
  };
}

function publicUrl(req: Request, path: string) {
  const base = config.publicBaseUrl || `${req.protocol}://${req.get("host")}`;
  return `${base}${path}`;
}

function safeExtension(originalName: string, mimeType: string) {
  const fromName = extname(originalName).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(fromName)) return fromName;
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    default:
      return ".img";
  }
}
