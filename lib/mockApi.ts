import type {
  ChartTimeframe,
  CreateTokenPayload,
  Paginated,
  PlatformStats,
  PricePoint,
  Token,
  TokenListParams,
  Transaction,
  UserPortfolio,
} from "./types";

const TOKENS_KEY = "tonpad.local.tokens";
const TXS_KEY = "tonpad.local.transactions";
const CONTRIBUTIONS_KEY = "tonpad.local.contributions";
const MOCK_POOL_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

type TxRequest = {
  to: string;
  amountNano: string;
  payload: string;
  validUntil: number;
  mock?: boolean;
};

type Contribution = {
  amountTon: number;
  tokensOwed: number;
  claimed: boolean;
  refunded: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function tokenStatus(token: Token): Token["presale"]["status"] {
  if (token.presale.status === "failed" || token.presale.status === "finalized") {
    return token.presale.status;
  }
  const now = Date.now();
  const start = new Date(token.presale.startTime).getTime();
  const end = new Date(token.presale.endTime).getTime();
  if (now < start) return "upcoming";
  if (now <= end && token.presale.raised < token.presale.hardCap) return "live";
  if (token.presale.raised >= token.presale.softCap) return "succeeded";
  return "failed";
}

function withLiveStatus(token: Token): Token {
  return { ...token, presale: { ...token.presale, status: tokenStatus(token) } };
}

function seedTokens(): Token[] {
  return [
    {
      id: "demo-aqua",
      address: MOCK_POOL_ADDRESS,
      name: "Aqua Pad",
      symbol: "AQUA",
      description: "Demo live presale with a steady buyback schedule.",
      imageUrl: null,
      totalSupply: 1_000_000_000,
      decimals: 9,
      allocations: { presale: 50, liquidity: 30, creator: 20 },
      presale: {
        rate: 1000,
        softCap: 100,
        hardCap: 500,
        raised: 184,
        contributors: 42,
        startTime: addDays(-1),
        endTime: addDays(5),
        status: "live",
        minContribution: 0.5,
        maxContribution: 50,
      },
      buyback: { enabled: true, percent: 20, rate: { percent: 5, intervalMinutes: 10 } },
      liquidityPercent: 70,
      social: {},
      creator: MOCK_POOL_ADDRESS,
      createdAt: addDays(-2),
      price: 0,
      priceChange24h: 0,
      marketCap: 0,
      volume24h: 0,
      holders: 0,
    },
    {
      id: "demo-orbit",
      address: MOCK_POOL_ADDRESS,
      name: "Orbit Finance",
      symbol: "ORBT",
      description: "Upcoming launch with buybacks disabled.",
      imageUrl: null,
      totalSupply: 500_000_000,
      decimals: 9,
      allocations: { presale: 45, liquidity: 35, creator: 20 },
      presale: {
        rate: 750,
        softCap: 75,
        hardCap: 300,
        raised: 0,
        contributors: 0,
        startTime: addDays(1),
        endTime: addDays(8),
        status: "upcoming",
        minContribution: 1,
        maxContribution: 25,
      },
      buyback: { enabled: false, percent: 0, rate: { percent: 5, intervalMinutes: 10 } },
      liquidityPercent: 70,
      social: {},
      creator: MOCK_POOL_ADDRESS,
      createdAt: addDays(-1),
      price: 0,
      priceChange24h: 0,
      marketCap: 0,
      volume24h: 0,
      holders: 0,
    },
    {
      id: "demo-nova",
      address: MOCK_POOL_ADDRESS,
      name: "Nova Ton",
      symbol: "NOVA",
      description: "Succeeded demo presale ready for claims.",
      imageUrl: null,
      totalSupply: 2_000_000_000,
      decimals: 9,
      allocations: { presale: 55, liquidity: 30, creator: 15 },
      presale: {
        rate: 1200,
        softCap: 50,
        hardCap: 250,
        raised: 250,
        contributors: 88,
        startTime: addDays(-10),
        endTime: addDays(-1),
        status: "succeeded",
        minContribution: 0.25,
        maxContribution: 20,
      },
      buyback: { enabled: true, percent: 30, rate: { percent: 10, intervalMinutes: 30 } },
      liquidityPercent: 75,
      social: {},
      creator: MOCK_POOL_ADDRESS,
      createdAt: addDays(-12),
      price: 0.0012,
      priceChange24h: 7.4,
      marketCap: 2_400_000,
      volume24h: 18_400,
      holders: 642,
    },
  ];
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function allTokens(): Token[] {
  const stored = readJson<Token[]>(TOKENS_KEY, []);
  return [...stored, ...seedTokens()].map(withLiveStatus);
}

function saveCreatedToken(token: Token) {
  const stored = readJson<Token[]>(TOKENS_KEY, []);
  writeJson(TOKENS_KEY, [token, ...stored.filter((t) => t.id !== token.id)]);
}

function allTransactions(): Transaction[] {
  return readJson<Transaction[]>(TXS_KEY, []);
}

function saveTransaction(tx: Transaction) {
  writeJson(TXS_KEY, [tx, ...allTransactions()].slice(0, 100));
}

function contributionKey(tokenId: string, wallet: string) {
  return `${tokenId}:${wallet}`;
}

function readContributions() {
  return readJson<Record<string, Contribution>>(CONTRIBUTIONS_KEY, {});
}

function writeContributions(contributions: Record<string, Contribution>) {
  writeJson(CONTRIBUTIONS_KEY, contributions);
}

function updateToken(tokenId: string, updater: (token: Token) => Token) {
  const stored = readJson<Token[]>(TOKENS_KEY, []);
  const seeds = seedTokens();
  const source = stored.find((t) => t.id === tokenId) ?? seeds.find((t) => t.id === tokenId);
  if (!source) return;
  const updated = updater(withLiveStatus(source));
  saveCreatedToken(updated);
}

function nanoTon(amountTon: number) {
  return String(Math.round(amountTon * 1_000_000_000));
}

function mockTx(to = MOCK_POOL_ADDRESS, amountNano = "50000000"): TxRequest {
  return {
    to,
    amountNano,
    payload: "",
    validUntil: Math.floor(Date.now() / 1000) + 600,
    mock: true,
  };
}

function createTokenFromPayload(payload: CreateTokenPayload): Token {
  const symbol = payload.symbol.trim().toUpperCase();
  const id = `${symbol.toLowerCase()}-${Date.now().toString(36)}`;
  return withLiveStatus({
    id,
    address: MOCK_POOL_ADDRESS,
    name: payload.name.trim(),
    symbol,
    description: payload.description.trim(),
    imageUrl: payload.imageUrl,
    totalSupply: payload.totalSupply,
    decimals: payload.decimals,
    allocations: payload.allocations,
    presale: {
      ...payload.presale,
      raised: 0,
      contributors: 0,
      status: "upcoming",
    },
    buyback: payload.buyback,
    liquidityPercent: payload.liquidityPercent,
    social: payload.social,
    creator: payload.creator,
    createdAt: nowIso(),
    price: 0,
    priceChange24h: 0,
    marketCap: 0,
    volume24h: 0,
    holders: 0,
  });
}

function sortTokens(tokens: Token[], sortBy: TokenListParams["sortBy"]) {
  const sorted = [...tokens];
  switch (sortBy) {
    case "raised":
      return sorted.sort((a, b) => b.presale.raised - a.presale.raised);
    case "marketCap":
      return sorted.sort((a, b) => b.marketCap - a.marketCap);
    case "volume24h":
      return sorted.sort((a, b) => b.volume24h - a.volume24h);
    case "newest":
    default:
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export const mockApi = {
  tokens: {
    async list(params: TokenListParams = {}): Promise<Paginated<Token>> {
      const search = params.search?.trim().toLowerCase();
      let items = allTokens();
      if (params.status && params.status !== "all" && params.status !== "trending") {
        items = items.filter((token) => token.presale.status === params.status);
      }
      if (params.status === "trending") {
        items = sortTokens(items, "raised").slice(0, params.limit ?? 12);
      }
      if (search) {
        items = items.filter(
          (token) =>
            token.name.toLowerCase().includes(search) ||
            token.symbol.toLowerCase().includes(search),
        );
      }
      items = sortTokens(items, params.sortBy ?? "newest");
      const page = params.page ?? 1;
      const limit = params.limit ?? (items.length || 20);
      const start = (page - 1) * limit;
      return { items: items.slice(start, start + limit), total: items.length, page, limit };
    },

    async trending(limit = 6): Promise<Token[]> {
      return sortTokens(allTokens(), "raised").slice(0, limit);
    },

    async get(id: string): Promise<Token> {
      const token = allTokens().find((t) => t.id === id);
      if (!token) throw new Error("Token not found");
      return token;
    },

    async chart(_id: string, _timeframe: ChartTimeframe): Promise<PricePoint[]> {
      const now = Date.now();
      return Array.from({ length: 24 }, (_, i) => ({
        t: now - (23 - i) * 60 * 60 * 1000,
        price: 0.001 + Math.sin(i / 3) * 0.00008 + i * 0.000006,
        volume: 250 + i * 18,
      }));
    },

    async transactions(id: string, limit = 25): Promise<Transaction[]> {
      return allTransactions().filter((tx) => tx.tokenId === id).slice(0, limit);
    },

    async create(payload: CreateTokenPayload): Promise<Token> {
      const token = createTokenFromPayload(payload);
      saveCreatedToken(token);
      return token;
    },
  },

  presale: {
    async contribute(tokenId: string, amountTon: number, wallet: string): Promise<TxRequest> {
      const token = allTokens().find((t) => t.id === tokenId);
      if (!token) throw new Error("Token not found");
      const contributions = readContributions();
      const key = contributionKey(tokenId, wallet);
      const current = contributions[key] ?? { amountTon: 0, tokensOwed: 0, claimed: false, refunded: false };
      contributions[key] = {
        ...current,
        amountTon: current.amountTon + amountTon,
        tokensOwed: current.tokensOwed + amountTon * token.presale.rate,
      };
      writeContributions(contributions);
      updateToken(tokenId, (t) => ({
        ...t,
        presale: {
          ...t.presale,
          raised: Math.min(t.presale.hardCap, t.presale.raised + amountTon),
          contributors: t.presale.contributors + (current.amountTon > 0 ? 0 : 1),
        },
      }));
      saveTransaction({
        id: `tx-${Date.now().toString(36)}`,
        hash: `local-${Date.now().toString(36)}`,
        kind: "contribute",
        amountTon,
        amountToken: amountTon * token.presale.rate,
        timestamp: nowIso(),
        wallet,
        tokenId,
      });
      return mockTx(MOCK_POOL_ADDRESS, nanoTon(amountTon));
    },

    async claim(tokenId: string, wallet: string): Promise<TxRequest> {
      const contributions = readContributions();
      const key = contributionKey(tokenId, wallet);
      const current = contributions[key];
      if (current) {
        contributions[key] = { ...current, claimed: true };
        writeContributions(contributions);
        saveTransaction({
          id: `tx-${Date.now().toString(36)}`,
          hash: `local-${Date.now().toString(36)}`,
          kind: "claim",
          amountTon: 0,
          amountToken: current.tokensOwed,
          timestamp: nowIso(),
          wallet,
          tokenId,
        });
      }
      return mockTx();
    },

    async refund(tokenId: string, wallet: string): Promise<TxRequest> {
      const contributions = readContributions();
      const key = contributionKey(tokenId, wallet);
      const current = contributions[key];
      if (current) {
        contributions[key] = { ...current, refunded: true, amountTon: 0, tokensOwed: 0 };
        writeContributions(contributions);
        saveTransaction({
          id: `tx-${Date.now().toString(36)}`,
          hash: `local-${Date.now().toString(36)}`,
          kind: "refund",
          amountTon: current.amountTon,
          amountToken: 0,
          timestamp: nowIso(),
          wallet,
          tokenId,
        });
      }
      return mockTx();
    },

    async myContribution(tokenId: string, wallet: string) {
      const contribution = readContributions()[contributionKey(tokenId, wallet)];
      return {
        amountTon: contribution?.amountTon ?? 0,
        tokensOwed: contribution?.tokensOwed ?? 0,
        claimed: contribution?.claimed ?? false,
      };
    },
  },

  stats: {
    async platform(): Promise<PlatformStats> {
      const tokens = allTokens();
      return {
        totalTokens: tokens.length,
        totalUsers: Math.max(128, tokens.reduce((sum, token) => sum + token.presale.contributors, 0)),
        totalVolumeTon: tokens.reduce((sum, token) => sum + token.volume24h, 0),
        totalLiquidityTon: tokens.reduce(
          (sum, token) => sum + token.presale.raised * (token.liquidityPercent / 100),
          0,
        ),
      };
    },
  },

  user: {
    async portfolio(wallet: string): Promise<UserPortfolio> {
      const contributions = readContributions();
      const holdings = Object.entries(contributions)
        .filter(([key, value]) => key.endsWith(`:${wallet}`) && value.tokensOwed > 0)
        .map(([key, value]) => {
          const tokenId = key.split(":")[0];
          const token = allTokens().find((t) => t.id === tokenId);
          return {
            tokenId,
            symbol: token?.symbol ?? "TOKEN",
            name: token?.name ?? "Unknown Token",
            imageUrl: token?.imageUrl ?? null,
            amount: value.tokensOwed,
            valueTon: value.amountTon,
            pnlPercent: 0,
          };
        });
      return {
        wallet,
        totalValueTon: holdings.reduce((sum, h) => sum + h.valueTon, 0),
        pnlPercent: 0,
        holdings,
      };
    },

    async created(wallet: string): Promise<Token[]> {
      return allTokens().filter((token) => token.creator === wallet);
    },

    async transactions(wallet: string, limit = 50): Promise<Transaction[]> {
      return allTransactions().filter((tx) => tx.wallet === wallet).slice(0, limit);
    },
  },

  upload: {
    async image(file: File): Promise<{ url: string }> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ url: String(reader.result) });
        reader.onerror = () => reject(new Error("Could not read image"));
        reader.readAsDataURL(file);
      });
    },
  },
};
