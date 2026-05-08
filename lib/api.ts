// =============================================================================
// API Client — production
// All backend interactions go through here. Configure via NEXT_PUBLIC_API_URL.
// Each method maps 1:1 to a documented endpoint in README.md → "API Contract".
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

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  isFormData?: boolean;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError(
      0,
      "Backend not configured. Set NEXT_PUBLIC_API_URL in .env.local.",
    );
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
export interface PresaleTxRequest {
  to: string;
  amountNano: string;
  payload: string;
  validUntil: number;
}

export const api = {
  tokens: {
    list: (params: TokenListParams = {}, signal?: AbortSignal) =>
      request<Paginated<Token>>("/tokens", { query: params as Record<string, never>, signal }),

    trending: (limit = 6, signal?: AbortSignal) =>
      request<Token[]>("/tokens/trending", { query: { limit }, signal }),

    get: (id: string, signal?: AbortSignal) =>
      request<Token>(`/tokens/${encodeURIComponent(id)}`, { signal }),

    chart: (id: string, timeframe: ChartTimeframe, signal?: AbortSignal) =>
      request<PricePoint[]>(`/tokens/${encodeURIComponent(id)}/chart`, {
        query: { timeframe },
        signal,
      }),

    transactions: (id: string, limit = 25, signal?: AbortSignal) =>
      request<Transaction[]>(`/tokens/${encodeURIComponent(id)}/transactions`, {
        query: { limit },
        signal,
      }),

    create: (payload: CreateTokenPayload) =>
      request<Token>("/tokens", { method: "POST", body: payload }),
  },

  presale: {
    /**
     * Returns BOC payload + destination that the frontend feeds into
     * tonConnectUI.sendTransaction. Backend tracks the contribution
     * once the on-chain tx confirms.
     */
    contribute: (tokenId: string, amountTon: number, wallet: string) =>
      request<PresaleTxRequest>(`/tokens/${encodeURIComponent(tokenId)}/presale/contribute`, {
        method: "POST",
        body: { amountTon, wallet },
      }),

    claim: (tokenId: string, wallet: string) =>
      request<PresaleTxRequest>(`/tokens/${encodeURIComponent(tokenId)}/presale/claim`, {
        method: "POST",
        body: { wallet },
      }),

    refund: (tokenId: string, wallet: string) =>
      request<PresaleTxRequest>(`/tokens/${encodeURIComponent(tokenId)}/presale/refund`, {
        method: "POST",
        body: { wallet },
      }),

    myContribution: (tokenId: string, wallet: string, signal?: AbortSignal) =>
      request<{ amountTon: number; tokensOwed: number; claimed: boolean }>(
        `/tokens/${encodeURIComponent(tokenId)}/presale/contribution`,
        { query: { wallet }, signal },
      ),
  },

  stats: {
    platform: (signal?: AbortSignal) =>
      request<PlatformStats>("/stats", { signal }),
  },

  user: {
    portfolio: (wallet: string, signal?: AbortSignal) =>
      request<UserPortfolio>(`/users/${encodeURIComponent(wallet)}/portfolio`, { signal }),

    created: (wallet: string, signal?: AbortSignal) =>
      request<Token[]>(`/users/${encodeURIComponent(wallet)}/created`, { signal }),

    transactions: (wallet: string, limit = 50, signal?: AbortSignal) =>
      request<Transaction[]>(`/users/${encodeURIComponent(wallet)}/transactions`, {
        query: { limit },
        signal,
      }),
  },

  upload: {
    image: async (file: File): Promise<{ url: string }> => {
      const fd = new FormData();
      fd.append("file", file);
      return request<{ url: string }>("/upload/image", {
        method: "POST",
        body: fd,
        isFormData: true,
      });
    },
  },
};

export type Api = typeof api;
