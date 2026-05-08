// =============================================================================
// SWR Hooks
// Thin wrappers around `api` for data fetching with caching + revalidation.
// =============================================================================

import useSWR, { type SWRConfiguration } from "swr";
import { api } from "./api";
import type {
  ChartTimeframe,
  TokenListParams,
} from "./types";

const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  shouldRetryOnError: false,
  dedupingInterval: 5_000,
};

export function useTokens(params: TokenListParams = {}, config: SWRConfiguration = {}) {
  const key = ["tokens", params] as const;
  return useSWR(key, ([, p]) => api.tokens.list(p), { ...defaultConfig, ...config });
}

export function useTrendingTokens(limit = 6, config: SWRConfiguration = {}) {
  return useSWR(["trending", limit] as const, ([, l]) => api.tokens.trending(l), {
    ...defaultConfig,
    ...config,
  });
}

export function useToken(id: string | null | undefined, config: SWRConfiguration = {}) {
  return useSWR(id ? (["token", id] as const) : null, ([, i]) => api.tokens.get(i), {
    ...defaultConfig,
    refreshInterval: 15_000, // live presale numbers
    ...config,
  });
}

export function useTokenChart(
  id: string | null | undefined,
  timeframe: ChartTimeframe,
  config: SWRConfiguration = {},
) {
  return useSWR(
    id ? (["chart", id, timeframe] as const) : null,
    ([, i, t]) => api.tokens.chart(i!, t),
    { ...defaultConfig, ...config },
  );
}

export function useTokenTransactions(
  id: string | null | undefined,
  limit = 25,
  config: SWRConfiguration = {},
) {
  return useSWR(
    id ? (["txs", id, limit] as const) : null,
    ([, i, l]) => api.tokens.transactions(i!, l),
    { ...defaultConfig, refreshInterval: 10_000, ...config },
  );
}

export function usePlatformStats(config: SWRConfiguration = {}) {
  return useSWR(["stats"] as const, () => api.stats.platform(), {
    ...defaultConfig,
    refreshInterval: 30_000,
    ...config,
  });
}

export function useUserPortfolio(
  wallet: string | null | undefined,
  config: SWRConfiguration = {},
) {
  return useSWR(
    wallet ? (["portfolio", wallet] as const) : null,
    ([, w]) => api.user.portfolio(w!),
    { ...defaultConfig, ...config },
  );
}

export function useUserCreated(
  wallet: string | null | undefined,
  config: SWRConfiguration = {},
) {
  return useSWR(
    wallet ? (["created", wallet] as const) : null,
    ([, w]) => api.user.created(w!),
    { ...defaultConfig, ...config },
  );
}

export function useUserTransactions(
  wallet: string | null | undefined,
  limit = 50,
  config: SWRConfiguration = {},
) {
  return useSWR(
    wallet ? (["userTxs", wallet, limit] as const) : null,
    ([, w, l]) => api.user.transactions(w!, l),
    { ...defaultConfig, ...config },
  );
}

export function useMyContribution(
  tokenId: string | null | undefined,
  wallet: string | null | undefined,
  config: SWRConfiguration = {},
) {
  return useSWR(
    tokenId && wallet ? (["myContrib", tokenId, wallet] as const) : null,
    ([, t, w]) => api.presale.myContribution(t!, w!),
    { ...defaultConfig, refreshInterval: 15_000, ...config },
  );
}
