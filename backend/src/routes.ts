import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import multer from "multer";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { config } from "./config";
import { prisma } from "./db";
import { reconcileFactoryLaunches } from "./indexer";
import { computeStatus, launchToToken, txToApi } from "./mappers";
import { createLaunchSchema, listQuerySchema, tonAddressSchema } from "./validation";
import { addressVariants, canonicalAddress } from "./address";

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

router.get("/api/wallet/:wallet/balance", async (req, res, next) => {
  try {
    const wallet = tonAddressSchema.parse(req.params.wallet);
    const balanceNano = await getAddressBalance(wallet);
    res.json({
      wallet,
      balanceNano,
      balanceTon: Number(balanceNano) / 1_000_000_000,
    });
  } catch (err) {
    next(err);
  }
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
          ? "succeeded"
          : query.status;
    }
    if (query.search) {
      where.OR = [
        { tokenName: { contains: query.search, mode: "insensitive" } },
        { symbol: { contains: query.search, mode: "insensitive" } },
        { creatorWallet: { contains: query.search, mode: "insensitive" } },
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
    const idAddressVariants = addressVariants(req.params.id);
    let launch = await prisma.launch.findFirst({
      where: {
        OR: [
          { id: req.params.id },
          { tokenMasterAddress: req.params.id },
          { presalePoolAddress: req.params.id },
          { tokenMasterAddress: { in: idAddressVariants } },
          { presalePoolAddress: { in: idAddressVariants } },
          { txHash: req.params.id },
        ],
      },
    });
    if (!launch) return res.status(404).json({ message: "Launch not found" });
    if (launch.pendingIndexing || !launch.presalePoolAddress) {
      try {
        await reconcileFactoryLaunches();
        launch =
          (await prisma.launch.findUnique({ where: { id: launch.id } })) ?? launch;
        console.log("[api] launch reconciliation check", {
          id: launch.id,
          txHash: launch.txHash,
          presalePoolAddress: launch.presalePoolAddress,
          tokenMasterAddress: launch.tokenMasterAddress,
        });
      } catch (err) {
        console.warn("[api] launch reconciliation skipped", err);
      }
    }

    const contributors = await prisma.transaction.groupBy({
      by: ["walletAddress"],
      where: { launchId: launch.id, type: "contribute" },
    });
    console.log("[api] GET /api/launches/:id returning", {
      id: launch.id,
      txHash: launch.txHash,
      presalePoolAddress: launch.presalePoolAddress,
      tokenMasterAddress: launch.tokenMasterAddress,
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
    const creatorWalletInput = body.creatorWallet ?? body.creator;
    if (!creatorWalletInput) return res.status(400).json({ message: "creatorWallet is required" });
    const creatorWallet = canonicalAddress(creatorWalletInput);
    const tokenMasterAddress = body.tokenMasterAddress ? canonicalAddress(body.tokenMasterAddress) : null;
    const presalePoolAddress = body.presalePoolAddress ? canonicalAddress(body.presalePoolAddress) : null;
    console.log("[api] POST /api/launches received", {
      name: body.name,
      symbol: body.symbol,
      creatorWallet,
      txHash: body.txHash,
      presalePoolAddress,
      tokenMasterAddress,
      hasPool: !!presalePoolAddress,
      hasToken: !!tokenMasterAddress,
      hasTxHash: !!body.txHash,
      hasBoc: !!body.transactionBoc,
    });

    const factoryAddress = body.factoryAddress ?? config.factoryAddress;
    const platformTonTreasury = (body.platformTonTreasury ?? config.platformTonTreasury) || null;
    const platformTokenTreasury = (body.platformTokenTreasury ?? config.platformTokenTreasury) || null;
    const platformTonFeeBps = body.platformTonFeeBps ?? config.platformTonFeeBps;
    const platformTokenFeeBps = body.platformTokenFeeBps ?? config.platformTokenFeeBps;
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
        tokenMasterAddress,
        presalePoolAddress,
        txHash: body.txHash,
        softCap: body.presale.softCap,
        hardCap: body.presale.hardCap,
        liquidityPercent: body.liquidityPercent,
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
        platformTonTreasury,
        platformTokenTreasury,
        platformTonFeeBps,
        platformTokenFeeBps,
        social: body.social,
        pendingIndexing: !(tokenMasterAddress && presalePoolAddress),
      },
      update: {
        logoUrl: body.logoUrl ?? body.imageUrl ?? undefined,
        metadataUrl: body.metadataUrl ?? undefined,
        creatorWallet,
        tokenMasterAddress: tokenMasterAddress ?? undefined,
        presalePoolAddress: presalePoolAddress ?? undefined,
        pendingIndexing:
          tokenMasterAddress && presalePoolAddress ? false : undefined,
        status,
        platformTonTreasury: platformTonTreasury ?? undefined,
        platformTokenTreasury: platformTokenTreasury ?? undefined,
        platformTonFeeBps,
        platformTokenFeeBps,
        social: body.social,
      },
    });

    if (launch.pendingIndexing || !launch.presalePoolAddress) {
      scheduleLaunchReconciliation(launch.id, launch.txHash);
      void reconcileFactoryLaunches()
        .then(async () => {
          const updated = await prisma.launch.findUnique({ where: { id: launch.id } });
          console.log("[api] async launch reconciliation requested", {
            id: launch.id,
            txHash: launch.txHash,
            detectedPoolAddress: updated?.presalePoolAddress ?? null,
            detectedTokenMasterAddress: updated?.tokenMasterAddress ?? null,
          });
        })
        .catch((err) => console.warn("[api] async launch reconciliation failed", err));
    }

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
      txHash: launch.txHash,
      presalePoolAddress: launch.presalePoolAddress,
      tokenMasterAddress: launch.tokenMasterAddress,
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
      totalRaised: stats.totalRaisedTon,
      activeHolders: stats.activeHolders,
      volume24h: stats.volume24hTon,
      totalTokens: stats.tokensLaunched,
      totalRaisedTon: stats.totalRaisedTon,
      totalUsers: stats.activeHolders,
      totalVolumeTon: stats.volume24hTon,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/api/profile/:wallet", async (req, res, next) => {
  try {
    const wallet = tonAddressSchema.parse(req.params.wallet);
    const walletVariants = addressVariants(wallet);
    const data = await safeDb(
      () =>
        Promise.all([
          prisma.launch.findMany({ where: { creatorWallet: { in: walletVariants } }, orderBy: { createdAt: "desc" } }),
          prisma.holder.findMany({ where: { walletAddress: { in: walletVariants }, tokenBalance: { gt: 0 } }, include: { launch: true } }),
          prisma.transaction.findMany({ where: { walletAddress: { in: walletVariants } }, include: { launch: true }, orderBy: { timestamp: "desc" }, take: 100 }),
          prisma.transaction.findMany({
            where: { walletAddress: { in: walletVariants }, type: "contribute" },
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
      .filter((tx) => tx.launch.status === "succeeded")
      .map((tx) => ({
        launch: launchToToken(tx.launch),
        amountTon: tx.amountTon,
        tokenAmount: tx.tokenAmount || tx.amountTon * tx.launch.presaleRate,
      }));
    const refundable = contributions
      .filter((tx) => tx.launch.status === "failed")
      .map((tx) => ({ launch: launchToToken(tx.launch), amountTon: tx.amountTon }));

    const indexedHoldings = holders.map((holder) => ({
      tokenId: holder.launchId,
      symbol: holder.launch.symbol,
      name: holder.launch.tokenName,
      imageUrl: holder.launch.logoUrl,
      amount: holder.tokenBalance,
      valueTon: 0,
      pnlPercent: 0,
    }));
    const indexedIds = new Set(indexedHoldings.map((holding) => holding.tokenId));
    const creatorAllocations = created.map((launch) => {
      const creatorAmount = (launch.totalSupply * (launch.creatorAllocation + launch.liquidityAllocation)) / 100;
      return {
        tokenId: launch.id,
        symbol: launch.symbol,
        name: launch.tokenName,
        imageUrl: launch.logoUrl,
        amount: creatorAmount,
        valueTon: 0,
        pnlPercent: 0,
        allocationType: "creator",
      };
    });
    const contributionPositions = contributions
      .filter((tx) => tx.launch.status !== "failed")
      .map((tx) => ({
        tokenId: tx.launchId,
        symbol: tx.launch.symbol,
        name: tx.launch.tokenName,
        imageUrl: tx.launch.logoUrl,
        amount: tx.tokenAmount || tx.amountTon * tx.launch.presaleRate,
        valueTon: tx.amountTon,
        pnlPercent: 0,
        allocationType: tx.launch.status === "succeeded" ? "claimable" : "presale",
      }));
    const holdings = [
      ...indexedHoldings,
      ...creatorAllocations.filter((holding) => !indexedIds.has(holding.tokenId)),
      ...contributionPositions,
    ];

    res.json({
      wallet,
      createdLaunches: created.map(launchToToken),
      contributedLaunches: contributions.map((tx) => ({ launch: launchToToken(tx.launch), transaction: txToApi(tx) })),
      claimedTokens: transactions
        .filter((tx) => tx.type === "claim")
        .map((tx) => ({ launch: launchToToken(tx.launch), transaction: txToApi(tx) })),
      claimableTokens: claimable,
      creatorAllocations,
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
    const walletVariants = addressVariants(wallet);
    const transactions = await safeDb(
      () =>
        prisma.transaction.findMany({
          where: { walletAddress: { in: walletVariants } },
          include: { launch: true },
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
router.get("/api/tokens/:id/transactions", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const launch = await prisma.launch.findFirst({
      where: {
        OR: [
          { id: req.params.id },
          { tokenMasterAddress: req.params.id },
          { presalePoolAddress: req.params.id },
          { tokenMasterAddress: { in: addressVariants(req.params.id) } },
          { presalePoolAddress: { in: addressVariants(req.params.id) } },
          { txHash: req.params.id },
        ],
      },
    });
    if (!launch) return res.json([]);
    const transactions = await prisma.transaction.findMany({
      where: { launchId: launch.id },
      include: { launch: true },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    res.json(transactions.map(txToApi));
  } catch (err) {
    next(err);
  }
});
router.get("/api/tokens/:id/presale/contribution", async (req, res, next) => {
  try {
    const wallet = tonAddressSchema.parse(String(req.query.wallet ?? ""));
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch) return res.status(404).json({ message: "Launch not found" });

    const walletVariants = addressVariants(wallet);
    const [contribution, claimed] = await Promise.all([
      prisma.transaction.aggregate({
        where: { launchId: launch.id, walletAddress: { in: walletVariants }, type: "contribute" },
        _sum: { amountTon: true, tokenAmount: true },
      }),
      prisma.transaction.findFirst({
        where: { launchId: launch.id, walletAddress: { in: walletVariants }, type: "claim" },
      }),
    ]);
    const amountTon = contribution._sum.amountTon ?? 0;
    res.json({
      amountTon,
      tokensOwed: contribution._sum.tokenAmount ?? amountTon * launch.presaleRate,
      claimed: !!claimed,
    });
  } catch (err) {
    next(err);
  }
});
router.post("/api/tokens/:id/presale/contribution", async (req, res, next) => {
  try {
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch) return res.status(404).json({ message: "Launch not found" });

    const wallet = canonicalAddress(String(req.body?.wallet ?? ""));
    const amountTon = Number(req.body?.amountTon ?? 0);
    if (!Number.isFinite(amountTon) || amountTon <= 0) {
      return res.status(400).json({ message: "amountTon must be greater than 0" });
    }
    const tokenAmount = Number(req.body?.tokenAmount ?? amountTon * launch.presaleRate);
    const txHash = String(req.body?.txHash ?? req.body?.transactionBoc ?? `contribution-${launch.id}-${wallet}-${Date.now()}`);

    const tx = await prisma.transaction.upsert({
      where: { txHash },
      create: {
        launchId: launch.id,
        walletAddress: wallet,
        txHash,
        type: "contribute",
        amountTon,
        tokenAmount: Number.isFinite(tokenAmount) ? tokenAmount : 0,
      },
      update: {
        launchId: launch.id,
        walletAddress: wallet,
        amountTon,
        tokenAmount: Number.isFinite(tokenAmount) ? tokenAmount : 0,
      },
    });
    const raised = await prisma.transaction.aggregate({
      where: { launchId: launch.id, type: "contribute" },
      _sum: { amountTon: true },
    });
    const updated = await prisma.launch.update({
      where: { id: launch.id },
      data: {
        raisedTon: raised._sum.amountTon ?? 0,
        status: computeStatus({
          ...launch,
          raisedTon: raised._sum.amountTon ?? 0,
        }),
      },
    });
    await updateStatsCache();
    console.log("[api] contribution recorded", {
      launchId: launch.id,
      txHash,
      wallet,
      amountTon,
      raisedTon: updated.raisedTon,
      presalePoolAddress: updated.presalePoolAddress,
    });
    res.status(201).json(txToApi({ ...tx, launch: updated }));
  } catch (err) {
    next(err);
  }
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
    const walletVariants = addressVariants(wallet);
    const holders = await safeDb(
      () =>
        prisma.holder.findMany({
          where: { walletAddress: { in: walletVariants }, tokenBalance: { gt: 0 } },
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
    const walletVariants = addressVariants(wallet);
    const created = await safeDb(
      () => prisma.launch.findMany({ where: { creatorWallet: { in: walletVariants } } }),
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
  const launches = await prisma.launch.findMany();
  await Promise.all(
    launches.map((launch) => {
      const status = computeStatus(launch);
      return status !== launch.status
        ? prisma.launch.update({ where: { id: launch.id }, data: { status } })
        : Promise.resolve(launch);
    }),
  );
}

function findLaunchByIdOrAddress(id: string) {
  const variants = addressVariants(id);
  return prisma.launch.findFirst({
    where: {
      OR: [
        { id },
        { tokenMasterAddress: id },
        { presalePoolAddress: id },
        { tokenMasterAddress: { in: variants } },
        { presalePoolAddress: { in: variants } },
        { txHash: id },
      ],
    },
  });
}

function scheduleLaunchReconciliation(launchId: string, txHash: string | null) {
  for (const delayMs of [2_000, 5_000, 10_000, 20_000]) {
    setTimeout(() => {
      void reconcileFactoryLaunches()
        .then(async () => {
          const launch = await prisma.launch.findUnique({ where: { id: launchId } });
          console.log("[api] scheduled launch reconciliation", {
            launchId,
            txHash,
            detectedPoolAddress: launch?.presalePoolAddress ?? null,
            detectedTokenMasterAddress: launch?.tokenMasterAddress ?? null,
            pendingIndexing: launch?.pendingIndexing ?? null,
          });
        })
        .catch((err) => console.warn("[api] scheduled launch reconciliation failed", { launchId, txHash, err }));
    }, delayMs).unref();
  }
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
  const [tokensLaunched, totalRaised, activeHolders, volume] = await Promise.all([
    prisma.launch.count(),
    prisma.launch.aggregate({ _sum: { raisedTon: true } }),
    prisma.holder.groupBy({ by: ["walletAddress"], where: { tokenBalance: { gt: 0 } } }),
    prisma.transaction.aggregate({
      where: { timestamp: { gte: dayAgo }, type: { in: ["contribute", "treasury"] } },
      _sum: { amountTon: true },
    }),
  ]);
  return prisma.statsCache.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      tokensLaunched,
      totalRaisedTon: totalRaised._sum.raisedTon ?? 0,
      activeHolders: activeHolders.length,
      volume24hTon: volume._sum.amountTon ?? 0,
    },
    update: {
      tokensLaunched,
      totalRaisedTon: totalRaised._sum.raisedTon ?? 0,
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
    case "marketCap":
      return [{ raisedTon: "desc" }, { updatedAt: "desc" }];
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

function emptyStats(_note: string) {
  return {
    tokensLaunched: 0,
    totalRaised: 0,
    activeHolders: 0,
    volume24h: 0,
    totalTokens: 0,
    totalRaisedTon: 0,
    totalUsers: 0,
    totalVolumeTon: 0,
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
  return `${base.replace(/^http:\/\//, "https://")}${path}`;
}

async function getAddressBalance(address: string) {
  const response = await fetch(config.toncenterEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.toncenterApiKey ? { "X-API-Key": config.toncenterApiKey } : {}),
    },
    body: JSON.stringify({
      id: "tonpad-balance",
      jsonrpc: "2.0",
      method: "getAddressBalance",
      params: { address },
    }),
  });
  if (!response.ok) {
    throw new Error(`Toncenter balance request failed: ${response.status}`);
  }
  const body = (await response.json()) as { ok?: boolean; result?: string; error?: string };
  if (body.ok === false || typeof body.result !== "string") {
    throw new Error(body.error ?? "Toncenter balance response was invalid");
  }
  return body.result;
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
