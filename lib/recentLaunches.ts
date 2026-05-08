import type { Paginated, Token, TokenListParams } from "./types";
import { DEFAULT_TOKEN_IMAGE_URL } from "./tonLaunchpad";

export const RECENT_LAUNCHES_KEY = "tonpad_recent_launches";

export interface RecentLaunch {
  id: string;
  name: string;
  symbol: string;
  transactionBoc?: string;
  transactionHash?: string;
  factoryAddress?: string;
  creator?: string;
  createdAt: string;
  poolAddress?: string | null;
  tokenAddress?: string | null;
  token: Token;
}

export function saveRecentLaunch(launch: RecentLaunch): void {
  if (typeof window === "undefined") return;
  const launches = getRecentLaunches();
  const next = [launch, ...launches.filter((item) => item.id !== launch.id)].slice(0, 20);
  window.localStorage.setItem(RECENT_LAUNCHES_KEY, JSON.stringify(next));
}

export function getRecentLaunches(): RecentLaunch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_LAUNCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRecentLaunch).filter(Boolean) as RecentLaunch[];
  } catch {
    return [];
  }
}

export function getRecentLaunchToken(id: string): Token | null {
  return getRecentLaunches().find((launch) => launch.id === id)?.token ?? null;
}

export function recentLaunchesPage(params: TokenListParams = {}): Paginated<Token> {
  let items = getRecentLaunches().map((launch) => launch.token);

  if (params.search) {
    const q = params.search.toLowerCase();
    items = items.filter(
      (token) =>
        token.name.toLowerCase().includes(q) ||
        token.symbol.toLowerCase().includes(q) ||
        (token.address ?? "").toLowerCase().includes(q),
    );
  }

  if (params.status) {
    items = items.filter((token) => token.presale.status === params.status);
  }

  return { items, total: items.length, page: 1, limit: items.length || 20 };
}

export function recentTrendingTokens(limit: number): Token[] {
  return getRecentLaunches()
    .map((launch) => launch.token)
    .slice(0, limit);
}

export function tokenFromLaunchInput(args: {
  id: string;
  form: {
    name: string;
    symbol: string;
    description: string;
    imageUrl: string | null;
    totalSupply: number;
    decimals: number;
    allocations: Token["allocations"];
    presale: Omit<Token["presale"], "raised" | "contributors" | "status">;
    buyback: Token["buyback"];
    liquidityPercent: number;
    social: Token["social"];
    creator: string;
  };
  factoryAddress?: string;
  createdAt: string;
}): Token {
  return normalizeToken({
    id: args.id,
    address: args.factoryAddress ?? null,
    name: args.form.name,
    symbol: args.form.symbol,
    description: args.form.description,
    imageUrl: args.form.imageUrl || DEFAULT_TOKEN_IMAGE_URL,
    totalSupply: args.form.totalSupply,
    decimals: args.form.decimals,
    allocations: args.form.allocations,
    presale: {
      ...args.form.presale,
      raised: 0,
      contributors: 0,
      status: "upcoming",
    },
    buyback: args.form.buyback,
    liquidityPercent: args.form.liquidityPercent,
    social: args.form.social,
    creator: args.form.creator,
    createdAt: args.createdAt,
    price: 0,
    priceChange24h: 0,
    marketCap: 0,
    volume24h: 0,
    holders: 0,
  });
}

export function normalizeToken(input: unknown): Token {
  const source = isRecord(input) ? input : {};
  const presale = isRecord(source.presale) ? source.presale : {};
  const allocations = isRecord(source.allocations) ? source.allocations : {};
  const buyback = isRecord(source.buyback) ? source.buyback : {};
  const rate = isRecord(buyback.rate) ? buyback.rate : {};
  const social = isRecord(source.social) ? source.social : {};
  const now = new Date().toISOString();

  return {
    id: stringValue(source.id, `token-${Date.now()}`),
    address: nullableString(source.address),
    name: stringValue(source.name, "Untitled Token"),
    symbol: stringValue(source.symbol, "TKN").toUpperCase(),
    description: stringValue(source.description, ""),
    imageUrl: nullableString(source.imageUrl) ?? DEFAULT_TOKEN_IMAGE_URL,
    totalSupply: numberValue(source.totalSupply, 0),
    decimals: numberValue(source.decimals, 9),
    allocations: {
      presale: numberValue(allocations.presale, 0),
      liquidity: numberValue(allocations.liquidity, 0),
      creator: numberValue(allocations.creator, 0),
    },
    presale: {
      rate: numberValue(presale.rate, 0),
      softCap: numberValue(presale.softCap, 0),
      hardCap: numberValue(presale.hardCap, 0),
      raised: numberValue(presale.raised, 0),
      contributors: numberValue(presale.contributors, 0),
      startTime: stringValue(presale.startTime, now),
      endTime: stringValue(presale.endTime, now),
      status: tokenStatus(presale.status),
      minContribution: optionalNumber(presale.minContribution),
      maxContribution: optionalNumber(presale.maxContribution),
    },
    buyback: {
      enabled: booleanValue(buyback.enabled, false),
      percent: numberValue(buyback.percent, 0),
      rate: {
        percent: numberValue(rate.percent, 0),
        intervalMinutes: numberValue(rate.intervalMinutes, 1),
      },
    },
    liquidityPercent: numberValue(source.liquidityPercent, 0),
    social: {
      website: optionalString(social.website),
      twitter: optionalString(social.twitter),
      telegram: optionalString(social.telegram),
    },
    creator: stringValue(source.creator, ""),
    createdAt: stringValue(source.createdAt, now),
    price: numberValue(source.price, 0),
    priceChange24h: numberValue(source.priceChange24h, 0),
    marketCap: numberValue(source.marketCap, 0),
    volume24h: numberValue(source.volume24h, 0),
    holders: numberValue(source.holders, 0),
  };
}

function normalizeRecentLaunch(input: unknown): RecentLaunch | null {
  if (!isRecord(input)) return null;
  const token = normalizeToken(input.token);
  return {
    id: stringValue(input.id, token.id),
    name: stringValue(input.name, token.name),
    symbol: stringValue(input.symbol, token.symbol),
    transactionBoc: optionalString(input.transactionBoc),
    transactionHash: optionalString(input.transactionHash),
    factoryAddress: optionalString(input.factoryAddress),
    creator: optionalString(input.creator),
    createdAt: stringValue(input.createdAt, token.createdAt),
    poolAddress: nullableString(input.poolAddress),
    tokenAddress: nullableString(input.tokenAddress),
    token,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function tokenStatus(value: unknown): Token["presale"]["status"] {
  if (
    value === "upcoming" ||
    value === "live" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "finalized"
  ) {
    return value;
  }
  return "upcoming";
}
