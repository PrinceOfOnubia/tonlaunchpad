import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { beginCell, toNano } from "@ton/core";
import multer from "multer";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { config } from "./config";
import { prisma } from "./db";
import { readOnChainLaunchCount, reconcileFactoryLaunches } from "./indexer";
import { computeStatus, launchToToken, txToApi } from "./mappers";
import { createLaunchSchema, listQuerySchema, tonAddressSchema } from "./validation";
import { addressVariants, canonicalAddress } from "./address";
import { buildPersistedAllocationFields } from "./allocation";

export const router = Router();
const CONTRIBUTE_OPCODE = 443500403;
const CLAIM_TOKENS_OPCODE = 1528841928;
const REFUND_OPCODE = 2910599901;
const CREATOR_CLAIM_TREASURY_OPCODE = 1459145241;
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

router.get("/health", async (_req, res) => {
  const [launchCount, unresolvedLaunches, onChainLaunchCount] = await Promise.all([
    safeDb(() => prisma.launch.count({ where: currentFactoryLaunchWhere() }), 0),
    safeDb(
      () =>
        prisma.launch.count({
          where: {
            ...currentFactoryLaunchWhere(),
            OR: [
              { pendingIndexing: true },
              { tokenMasterAddress: null },
              { presalePoolAddress: null },
            ],
          },
        }),
      0,
    ),
    safeAsync(() => readOnChainLaunchCount(), null),
  ]);
  res.json({
    ok: true,
    network: config.network,
    indexedFactory: config.factoryAddress,
    apiConfigured: !!config.factoryAddress && !!config.toncenterEndpoint,
    indexerIntervalMs: config.indexerIntervalMs,
    indexerFastPollLimit: config.indexerFastPollLimit,
    indexerFullPollLimit: config.indexerFullPollLimit,
    indexerRefreshLimit: config.indexerRefreshLimit,
    onChainLaunchCount,
    currentFactoryLaunchCount: launchCount,
    unresolvedCurrentFactoryLaunches: unresolvedLaunches,
  });
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
    image: String(req.body?.imageUrl ?? "https://tonpad.org/icon.png"),
  };
  const fileName = `${Date.now()}-${metadata.symbol.toLowerCase().replace(/[^a-z0-9]/g, "") || "token"}.json`;
  writeFileSync(join(config.uploadDir, fileName), JSON.stringify(metadata, null, 2));
  const metadataUrl = publicUrl(req, `/uploads/${fileName}`);
  res.status(201).json({ url: metadataUrl, metadataUrl, uri: metadataUrl });
});

router.get("/api/launches", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const baseWhere = currentFactoryLaunchWhere();
    await ensureFactoryLaunchBootstrap("[api] launches bootstrap");
    try {
      await refreshStatuses();
    } catch (err) {
      console.warn("[api] status refresh skipped", err);
    }

    const where: Prisma.LaunchWhereInput = baseWhere;
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
    const requestedId = req.params.id;
    console.log("[api] GET /api/launches/:id requested", {
      requestedId,
      factoryAddress: config.factoryAddress,
    });
    const idAddressVariants = addressVariants(req.params.id);
    let launch = await prisma.launch.findFirst({
      where: {
        ...currentFactoryLaunchWhere(),
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
    if (!launch) {
      if (isOptimisticRecentLaunchId(requestedId)) {
        try {
          await reconcileFactoryLaunches({ mode: "full" });
          launch = await prisma.launch.findFirst({
            where: {
              ...currentFactoryLaunchWhere(),
              OR: [
                { id: requestedId },
                { txHash: requestedId },
              ],
            },
          });
        } catch (err) {
          console.warn("[api] optimistic launch reconciliation failed", {
            requestedId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (!launch) {
        console.warn("[api] launch unresolved; returning pending placeholder", {
          requestedId,
          factoryAddress: config.factoryAddress,
        });
        return res.json(buildPendingLaunchResponse(requestedId));
      }
    }
    if (launch.pendingIndexing || !launch.presalePoolAddress) {
      try {
        await reconcileFactoryLaunches({ mode: "full" });
        launch =
          (await prisma.launch.findUnique({ where: { id: launch.id } })) ?? launch;
        console.log("[api] launch reconciliation check", {
          id: launch.id,
          txHash: launch.txHash,
          presalePoolAddress: launch.presalePoolAddress,
          tokenMasterAddress: launch.tokenMasterAddress,
        });
      } catch (err) {
        console.warn("[api] launch reconciliation skipped", {
          requestedId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (launch.pendingIndexing || !launch.tokenMasterAddress || !launch.presalePoolAddress) {
      console.log("[api] launch still pending after reconciliation", {
        requestedId,
        resolvedLaunchId: launch.id,
        tokenMasterAddress: launch.tokenMasterAddress,
        presalePoolAddress: launch.presalePoolAddress,
      });
      return res.json({
        ...launchToToken(launch),
        status: "pending",
        tokenMasterAddress: launch.tokenMasterAddress ?? null,
        presalePoolAddress: launch.presalePoolAddress ?? null,
        setupState: "preparing",
        presale: {
          ...launchToToken(launch).presale,
          contributors: 0,
        },
      });
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

    const factoryAddress = canonicalAddress(body.factoryAddress ?? config.factoryAddress);
    const platformTonTreasury = (body.platformTonTreasury ?? config.platformTonTreasury) || null;
    const platformTokenTreasury = (body.platformTokenTreasury ?? config.platformTokenTreasury) || null;
    const liquidityTreasury = body.liquidityTreasury ?? config.liquidityTreasury ?? null;
    const platformTonFeeBps = body.platformTonFeeBps ?? config.platformTonFeeBps;
    const platformTokenFeeBps = body.platformTokenFeeBps ?? config.platformTokenFeeBps;
    const platformTokenFeeAmount = (body.totalSupply * platformTokenFeeBps) / 10000;
    const platformTokenFeeTonTreasuryShare = platformTokenFeeAmount / 2;
    const platformTokenFeeTokenTreasuryShare =
      platformTokenFeeAmount - platformTokenFeeTonTreasuryShare;
    const allocationFields = buildPersistedAllocationFields({
      totalSupply: body.totalSupply,
      presalePercent: body.allocations.presale,
      liquidityPercentTokens: body.allocations.liquidity,
      creatorPercent: body.allocations.creator,
      totalRaisedTon: 0,
      liquidityPercentOfRaised: body.liquidityPercent,
      platformTonFeeBps,
      platformTokenFeeBps,
      liquidityTreasurySet: !!liquidityTreasury,
      burnedTokens: 0,
    });
    const status = computeStatus({
      startTime: body.presale.startTime,
      endTime: body.presale.endTime,
      raisedTon: 0,
      softCap: body.presale.softCap,
      hardCap: body.presale.hardCap,
      status: "upcoming",
    });

    const launchTxRef =
      body.txHash ??
      body.transactionBoc ??
      `frontend-${factoryAddress}-${creatorWallet}-${body.symbol}-${body.presale.startTime.toISOString()}`;

    const launch = await prisma.launch.upsert({
      where: { txHash: launchTxRef },
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
        txHash: launchTxRef,
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
        presaleTokens: allocationFields.presaleTokens,
        liquidityTokens: allocationFields.liquidityTokens,
        creatorTokens: allocationFields.creatorTokens,
        presaleTON: allocationFields.presaleTON,
        liquidityTON: allocationFields.liquidityTON,
        platformFeeTON: allocationFields.platformFeeTON,
        creatorTON: allocationFields.creatorTON,
        platformTonTreasury,
        platformTokenTreasury,
        liquidityTreasury,
        platformTonFeeBps,
        platformTokenFeeBps,
        platformTokenFeeAmount,
        platformTokenFeeTonTreasuryShare,
        platformTokenFeeTokenTreasuryShare,
        social: body.social,
        pendingIndexing: !(tokenMasterAddress && presalePoolAddress),
      },
      update: {
        txHash: launchTxRef,
        logoUrl: body.logoUrl ?? body.imageUrl ?? undefined,
        metadataUrl: body.metadataUrl ?? undefined,
        creatorWallet,
        tokenMasterAddress: tokenMasterAddress ?? undefined,
        presalePoolAddress: presalePoolAddress ?? undefined,
        pendingIndexing:
          tokenMasterAddress && presalePoolAddress ? false : undefined,
        status,
        factoryAddress,
        totalSupply: body.totalSupply,
        decimals: body.decimals,
        presaleRate: body.presale.rate,
        softCap: body.presale.softCap,
        hardCap: body.presale.hardCap,
        liquidityPercent: body.liquidityPercent,
        startTime: body.presale.startTime,
        endTime: body.presale.endTime,
        presaleAllocation: body.allocations.presale,
        liquidityAllocation: body.allocations.liquidity,
        creatorAllocation: body.allocations.creator,
        presaleTokens: allocationFields.presaleTokens,
        liquidityTokens: allocationFields.liquidityTokens,
        creatorTokens: allocationFields.creatorTokens,
        presaleTON: allocationFields.presaleTON,
        liquidityTON: allocationFields.liquidityTON,
        platformFeeTON: allocationFields.platformFeeTON,
        creatorTON: allocationFields.creatorTON,
        platformTonTreasury: platformTonTreasury ?? undefined,
        platformTokenTreasury: platformTokenTreasury ?? undefined,
        liquidityTreasury: liquidityTreasury ?? undefined,
        platformTonFeeBps,
        platformTokenFeeBps,
        platformTokenFeeAmount,
        platformTokenFeeTonTreasuryShare,
        platformTokenFeeTokenTreasuryShare,
        social: body.social,
      },
    });

    if (launch.pendingIndexing || !launch.presalePoolAddress) {
      scheduleLaunchReconciliation(launch.id, launch.txHash);
      void reconcileFactoryLaunches({ mode: "fast" })
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

    const launchTxHash = launch.txHash ?? `launch-${launch.id}-${creatorWallet}`;

    if (launchTxHash) {
      await prisma.transaction.upsert({
        where: { txHash: launchTxHash },
        create: {
          launchId: launch.id,
          walletAddress: creatorWallet,
          txHash: launchTxHash,
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
    await ensureFactoryLaunchBootstrap("[api] stats bootstrap");
    let stats = await safeDb(() => updateStatsCache(), null);
    if (stats && stats.tokensLaunched === 0) {
      try {
        await reconcileFactoryLaunches({ mode: "full" });
        stats = await safeDb(() => updateStatsCache(), stats);
      } catch (err) {
        console.warn("[api] stats reconciliation bootstrap skipped", err);
      }
    }
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
    await ensureFactoryLaunchBootstrap("[api] profile bootstrap");
    const wallet = tonAddressSchema.parse(req.params.wallet);
    const walletVariants = addressVariants(wallet);
    const data = await safeDb(
      () =>
        Promise.all([
          prisma.launch.findMany({
            where: { ...currentFactoryLaunchWhere(), creatorWallet: { in: walletVariants } },
            orderBy: { createdAt: "desc" },
          }),
          prisma.holder.findMany({
            where: {
              walletAddress: { in: walletVariants },
              tokenBalance: { gt: 0 },
              launch: { is: currentFactoryLaunchWhere() },
            },
            include: { launch: true },
          }),
          prisma.transaction.findMany({
            where: { walletAddress: { in: walletVariants }, launch: { is: currentFactoryLaunchWhere() } },
            include: { launch: true },
            orderBy: { timestamp: "desc" },
            take: 100,
          }),
          prisma.transaction.findMany({
            where: { walletAddress: { in: walletVariants }, type: "contribute", launch: { is: currentFactoryLaunchWhere() } },
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
      allocationType: "wallet",
    }));
    const indexedIds = new Set(indexedHoldings.map((holding) => holding.tokenId));
    const creatorAllocations = created.map((launch) => {
      const creatorAmount =
        (launch.totalSupply * launch.creatorAllocation) / 100 +
        (launch.liquidityTreasury ? 0 : (launch.totalSupply * launch.liquidityAllocation) / 100);
      return {
        tokenId: launch.id,
        symbol: launch.symbol,
        name: launch.tokenName,
        imageUrl: launch.logoUrl,
        amount: creatorAmount,
        valueTon: 0,
        pnlPercent: 0,
        allocationType: "projected_creator",
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
    await ensureFactoryLaunchBootstrap("[api] transactions bootstrap");
    const wallet = tonAddressSchema.parse(req.params.wallet);
    const walletVariants = addressVariants(wallet);
    const transactions = await safeDb(
      () =>
        prisma.transaction.findMany({
          where: { walletAddress: { in: walletVariants }, launch: { is: currentFactoryLaunchWhere() } },
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
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch || launch.pendingIndexing || !launch.tokenMasterAddress || !launch.presalePoolAddress) {
      console.log("[api] token transactions unresolved; returning empty", {
        requestedId: req.params.id,
        launchId: launch?.id ?? null,
        tokenMasterAddress: launch?.tokenMasterAddress ?? null,
        presalePoolAddress: launch?.presalePoolAddress ?? null,
      });
      return res.json([]);
    }
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
    if (!launch || launch.pendingIndexing || !launch.tokenMasterAddress || !launch.presalePoolAddress) {
      console.log("[api] presale contribution unresolved; returning zero state", {
        requestedId: req.params.id,
        launchId: launch?.id ?? null,
        tokenMasterAddress: launch?.tokenMasterAddress ?? null,
        presalePoolAddress: launch?.presalePoolAddress ?? null,
      });
      return res.json({
        amountTon: 0,
        tokensOwed: 0,
        claimed: false,
        pending: true,
      });
    }

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
router.post("/api/tokens/:id/presale/contribute", async (req, res, next) => {
  try {
    const wallet = tonAddressSchema.parse(String(req.body?.wallet ?? ""));
    const amountTon = Number(req.body?.amountTon ?? 0);
    if (!Number.isFinite(amountTon) || amountTon <= 0) {
      return res.status(400).json({ message: "amountTon must be greater than 0" });
    }
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch || !launch.presalePoolAddress) {
      return res.status(404).json({ message: "Launch not found" });
    }
    void wallet;
    res.json(buildPresaleTx(launch.presalePoolAddress, CONTRIBUTE_OPCODE, amountTon.toString()));
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
router.post("/api/tokens/:id/presale/claim", async (req, res, next) => {
  try {
    tonAddressSchema.parse(String(req.body?.wallet ?? ""));
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch || !launch.presalePoolAddress) {
      return res.status(404).json({ message: "Launch not found" });
    }
    res.json(buildPresaleTx(launch.presalePoolAddress, CLAIM_TOKENS_OPCODE, "0.2"));
  } catch (err) {
    next(err);
  }
});
router.post("/api/tokens/:id/presale/refund", async (req, res, next) => {
  try {
    tonAddressSchema.parse(String(req.body?.wallet ?? ""));
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch || !launch.presalePoolAddress) {
      return res.status(404).json({ message: "Launch not found" });
    }
    res.json(buildPresaleTx(launch.presalePoolAddress, REFUND_OPCODE, "0.05"));
  } catch (err) {
    next(err);
  }
});
router.post("/api/tokens/:id/presale/claim/record", async (req, res, next) => {
  try {
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch) return res.status(404).json({ message: "Launch not found" });
    const wallet = canonicalAddress(String(req.body?.wallet ?? ""));
    const txHash = String(req.body?.txHash ?? req.body?.transactionBoc ?? `claim-${launch.id}-${wallet}-${Date.now()}`);
    const contribute = await prisma.transaction.aggregate({
      where: { launchId: launch.id, walletAddress: { in: addressVariants(wallet) }, type: "contribute" },
      _sum: { amountTon: true, tokenAmount: true },
    });
    const tx = await prisma.transaction.upsert({
      where: { txHash },
      create: {
        launchId: launch.id,
        walletAddress: wallet,
        txHash,
        type: "claim",
        amountTon: contribute._sum.amountTon ?? 0,
        tokenAmount: contribute._sum.tokenAmount ?? 0,
      },
      update: {},
    });
    const updated = await prisma.launch.update({
      where: { id: launch.id },
      data: { status: computeStatus({ ...launch, raisedTon: launch.raisedTon }) },
    });
    await updateStatsCache();
    res.status(201).json(txToApi({ ...tx, launch: updated }));
  } catch (err) {
    next(err);
  }
});
router.post("/api/tokens/:id/presale/refund/record", async (req, res, next) => {
  try {
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch) return res.status(404).json({ message: "Launch not found" });
    const wallet = canonicalAddress(String(req.body?.wallet ?? ""));
    const txHash = String(req.body?.txHash ?? req.body?.transactionBoc ?? `refund-${launch.id}-${wallet}-${Date.now()}`);
    const contribute = await prisma.transaction.aggregate({
      where: { launchId: launch.id, walletAddress: { in: addressVariants(wallet) }, type: "contribute" },
      _sum: { amountTon: true },
    });
    const tx = await prisma.transaction.upsert({
      where: { txHash },
      create: {
        launchId: launch.id,
        walletAddress: wallet,
        txHash,
        type: "refund",
        amountTon: contribute._sum.amountTon ?? 0,
      },
      update: {},
    });
    await updateStatsCache();
    res.status(201).json(txToApi({ ...tx, launch }));
  } catch (err) {
    next(err);
  }
});
router.post("/api/tokens/:id/presale/treasury/record", async (req, res, next) => {
  try {
    const launch = await findLaunchByIdOrAddress(req.params.id);
    if (!launch) return res.status(404).json({ message: "Launch not found" });
    const wallet = canonicalAddress(String(req.body?.wallet ?? ""));
    const txHash = String(req.body?.txHash ?? req.body?.transactionBoc ?? `treasury-${launch.id}-${wallet}-${Date.now()}`);
    const tx = await prisma.transaction.upsert({
      where: { txHash },
      create: {
        launchId: launch.id,
        walletAddress: wallet,
        txHash,
        type: "treasury",
        amountTon: launch.creatorTreasuryAmount || Math.max(launch.raisedTon - (launch.raisedTon * launch.platformTonFeeBps) / 10000 - launch.liquidityTonAmount, 0),
      },
      update: {},
    });
    await updateStatsCache();
    res.status(201).json(txToApi({ ...tx, launch }));
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
          where: { walletAddress: { in: walletVariants }, tokenBalance: { gt: 0 }, launch: { is: currentFactoryLaunchWhere() } },
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
      () =>
        prisma.launch.findMany({
          where: { ...currentFactoryLaunchWhere(), creatorWallet: { in: walletVariants } },
        }),
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
  const launches = await prisma.launch.findMany({ where: currentFactoryLaunchWhere() });
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
  const query = () =>
    prisma.launch.findFirst({
      where: {
        ...currentFactoryLaunchWhere(),
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
  return query().then(async (launch) => {
    if (launch) return launch;
    await ensureFactoryLaunchBootstrap("[api] launch lookup bootstrap");
    const resolved = await query();
    if (!resolved) {
      console.warn("[api] launch lookup unresolved", {
        requestedId: id,
        factoryAddress: config.factoryAddress,
      });
    }
    return resolved;
  });
}

async function ensureFactoryLaunchBootstrap(reason: string) {
  const [launchCount, unresolvedLaunchCount, onChainLaunchCount] = await Promise.all([
    safeDb(() => prisma.launch.count({ where: currentFactoryLaunchWhere() }), 0),
    safeDb(
      () =>
        prisma.launch.count({
          where: {
            ...currentFactoryLaunchWhere(),
            OR: [
              { pendingIndexing: true },
              { tokenMasterAddress: null },
              { presalePoolAddress: null },
            ],
          },
        }),
      0,
    ),
    safeAsync(() => readOnChainLaunchCount(), 0),
  ]);
  const launchLag = Math.max(onChainLaunchCount - launchCount, 0);
  console.log("[api] bootstrap check", {
    reason,
    factoryAddress: config.factoryAddress,
    launchCount,
    unresolvedLaunchCount,
    onChainLaunchCount,
    launchLag,
  });
  if (launchCount > 0 && unresolvedLaunchCount === 0 && launchLag === 0) return;
  try {
    await reconcileFactoryLaunches({
      mode:
        launchCount === 0 || unresolvedLaunchCount > 0 || launchLag > 0
          ? "full"
          : "fast",
    });
  } catch (err) {
    console.warn(reason, err);
  }
}

function scheduleLaunchReconciliation(launchId: string, txHash: string | null) {
  for (const delayMs of [2_000, 5_000, 10_000, 20_000]) {
    setTimeout(() => {
      void reconcileFactoryLaunches({ mode: "fast" })
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
  const launchWhere: Prisma.LaunchWhereInput = {
    ...currentFactoryLaunchWhere(),
    tokenMasterAddress: { not: null },
  };
  const [tokensLaunched, totalRaised, activeHolders, volume] = await Promise.all([
    prisma.launch.count({ where: launchWhere }),
    prisma.launch.aggregate({ where: launchWhere, _sum: { raisedTon: true } }),
    prisma.holder.groupBy({ by: ["walletAddress"], where: { tokenBalance: { gt: 0 }, launch: { is: currentFactoryLaunchWhere() } } }),
    prisma.transaction.aggregate({
      where: { timestamp: { gte: dayAgo }, type: "contribute", launch: { is: currentFactoryLaunchWhere() } },
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

async function safeAsync<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    console.error("[api] async operation failed", err);
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
    createdLaunches: [],
    createdTokens: [],
    contributedLaunches: [],
    claimedTokens: [],
    claimableTokens: [],
    creatorAllocations: [],
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

function isOptimisticRecentLaunchId(value: string) {
  return value.startsWith("recent-");
}

function buildPendingLaunchResponse(id: string) {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60 * 1000);
  return {
    id,
    address: null,
    presalePoolAddress: null,
    tokenMasterAddress: null,
    factoryAddress: config.factoryAddress || null,
    txHash: null,
    metadataUrl: null,
    name: "Pending Launch",
    symbol: "PENDING",
    description: "",
    imageUrl: "https://tonpad.org/icon.png",
    totalSupply: 0,
    decimals: 9,
    allocations: {
      presale: 0,
      liquidity: 0,
      creator: 0,
    },
    presale: {
      rate: 0,
      softCap: 0,
      hardCap: 0,
      raised: 0,
      contributors: 0,
      startTime: now.toISOString(),
      endTime: later.toISOString(),
      status: "upcoming",
    },
    liquidityPercent: 0,
    social: {},
    creator: "",
    createdAt: now.toISOString(),
    price: 0,
    priceChange24h: 0,
    marketCap: 0,
    volume24h: 0,
    holders: 0,
    setupState: "preparing",
    status: "pending",
  };
}

function currentFactoryLaunchWhere(): Prisma.LaunchWhereInput {
  if (!config.factoryAddress) return {};
  return { factoryAddress: { in: addressVariants(config.factoryAddress) } };
}

function buildPresaleTx(poolAddress: string, opcode: number, amountTon: string) {
  const body = beginCell().storeUint(opcode, 32).endCell();
  return {
    to: poolAddress,
    amountNano: toNano(amountTon).toString(),
    payload: body.toBoc().toString("base64"),
    validUntil: Math.floor(Date.now() / 1000) + 240,
  };
}

async function getAddressBalance(address: string) {
  const requestBody = JSON.stringify({
    id: "tonpad-balance",
    jsonrpc: "2.0",
    method: "getAddressBalance",
    params: { address },
  });

  const send = async (apiKey?: string) => {
    const response = await fetch(config.toncenterEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: requestBody,
    });
    const body = (await response.json()) as {
      ok?: boolean;
      result?: string;
      error?: string;
      code?: number;
    };
    return { response, body };
  };

  let { response, body } = await send(config.toncenterApiKey || undefined);
  const invalidApiKey =
    response.status === 401 ||
    body.code === 401 ||
    body.error === "API key does not exist";
  if (invalidApiKey && config.toncenterApiKey) {
    console.warn("[api] Toncenter API key rejected for balance lookup; retrying without key");
    ({ response, body } = await send(undefined));
  }

  if (!response.ok) {
    throw new Error(`Toncenter balance request failed: ${response.status}`);
  }
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
