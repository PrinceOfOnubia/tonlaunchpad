// =============================================================================
// API Client
// All backend interactions go through here. The frontend never hard-codes data.
//
// Configure via NEXT_PUBLIC_API_URL (see .env.example).
// Every method maps 1:1 to a documented endpoint in README.md → "API Contract".
// =============================================================================

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
import { mockApi } from "./mockApi";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const isLocalApiMode = !API_URL;

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Query string params */
  query?: Record<string, string | number | boolean | undefined>;
  /** Pass through fetch signal for cancellation */
  signal?: AbortSignal;
  /** Set when sending FormData (image upload) */
  isFormData?: boolean;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, "API URL is not configured.");
  }

  const url = new URL(`${API_URL}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (opts.isFormData) {
    body = opts.body as FormData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body,
      signal: opts.signal,
      credentials: "include",
    });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : "Network error");
  }

  if (!res.ok) {
    let errBody: unknown;
    try {
      errBody = await res.json();
    } catch {
      /* ignore */
    }
    const msg =
      (errBody && typeof errBody === "object" && "message" in errBody
        ? String((errBody as { message: unknown }).message)
        : null) ?? res.statusText;
    throw new ApiError(res.status, msg, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------
export const api = {
  tokens: {
    list: (params: TokenListParams = {}, signal?: AbortSignal) =>
      !isLocalApiMode
        ? request<Paginated<Token>>("/tokens", { query: params as Record<string, never>, signal })
        : mockApi.tokens.list(params),

    trending: (limit = 6, signal?: AbortSignal) =>
      !isLocalApiMode
        ? request<Token[]>("/tokens/trending", { query: { limit }, signal })
        : mockApi.tokens.trending(limit),

    get: (id: string, signal?: AbortSignal) =>
      !isLocalApiMode ? request<Token>(`/tokens/${encodeURIComponent(id)}`, { signal }) : mockApi.tokens.get(id),

    chart: (id: string, timeframe: ChartTimeframe, signal?: AbortSignal) =>
      !isLocalApiMode
        ? request<PricePoint[]>(`/tokens/${encodeURIComponent(id)}/chart`, {
            query: { timeframe },
            signal,
          })
        : mockApi.tokens.chart(id, timeframe),

    transactions: (id: string, limit = 25, signal?: AbortSignal) =>
      !isLocalApiMode
        ? request<Transaction[]>(`/tokens/${encodeURIComponent(id)}/transactions`, {
            query: { limit },
            signal,
          })
        : mockApi.tokens.transactions(id, limit),

    create: (payload: CreateTokenPayload) =>
      !isLocalApiMode ? request<Token>("/tokens", { method: "POST", body: payload }) : mockApi.tokens.create(payload),
  },

  presale: {
    /**
     * Returns BOC payload + destination address that the frontend hands to
     * tonConnectUI.sendTransaction. Backend tracks the contribution off-chain
     * once the on-chain tx confirms.
     */
    contribute: (tokenId: string, amountTon: number, wallet: string) =>
      !isLocalApiMode
        ? request<{ to: string; amountNano: string; payload: string; validUntil: number; mock?: boolean }>(
            `/tokens/${encodeURIComponent(tokenId)}/presale/contribute`,
            { method: "POST", body: { amountTon, wallet } },
          )
        : mockApi.presale.contribute(tokenId, amountTon, wallet),

    claim: (tokenId: string, wallet: string) =>
      !isLocalApiMode
        ? request<{ to: string; amountNano: string; payload: string; validUntil: number; mock?: boolean }>(
            `/tokens/${encodeURIComponent(tokenId)}/presale/claim`,
            { method: "POST", body: { wallet } },
          )
        : mockApi.presale.claim(tokenId, wallet),

    refund: (tokenId: string, wallet: string) =>
      !isLocalApiMode
        ? request<{ to: string; amountNano: string; payload: string; validUntil: number; mock?: boolean }>(
            `/tokens/${encodeURIComponent(tokenId)}/presale/refund`,
            { method: "POST", body: { wallet } },
          )
        : mockApi.presale.refund(tokenId, wallet),

    /** Per-wallet contribution status */
    myContribution: (tokenId: string, wallet: string, signal?: AbortSignal) =>
      !isLocalApiMode
        ? request<{ amountTon: number; tokensOwed: number; claimed: boolean }>(
            `/tokens/${encodeURIComponent(tokenId)}/presale/contribution`,
            { query: { wallet }, signal },
          )
        : mockApi.presale.myContribution(tokenId, wallet),
  },

  stats: {
    platform: (signal?: AbortSignal) =>
      !isLocalApiMode ? request<PlatformStats>("/stats", { signal }) : mockApi.stats.platform(),
  },

  user: {
    portfolio: (wallet: string, signal?: AbortSignal) =>
      !isLocalApiMode
        ? request<UserPortfolio>(`/users/${encodeURIComponent(wallet)}/portfolio`, { signal })
        : mockApi.user.portfolio(wallet),

    created: (wallet: string, signal?: AbortSignal) =>
      !isLocalApiMode
        ? request<Token[]>(`/users/${encodeURIComponent(wallet)}/created`, { signal })
        : mockApi.user.created(wallet),

    transactions: (wallet: string, limit = 50, signal?: AbortSignal) =>
      !isLocalApiMode
        ? request<Transaction[]>(`/users/${encodeURIComponent(wallet)}/transactions`, {
            query: { limit },
            signal,
          })
        : mockApi.user.transactions(wallet, limit),
  },

  upload: {
    /** Returns a public URL the frontend can use as imageUrl */
    image: async (file: File): Promise<{ url: string }> => {
      const fd = new FormData();
      fd.append("file", file);
      return !isLocalApiMode
        ? request<{ url: string }>("/upload/image", {
            method: "POST",
            body: fd,
            isFormData: true,
          })
        : mockApi.upload.image(file);
    },
  },
};

export type Api = typeof api;
