// =============================================================================
// SWR Hooks
// Thin wrappers around `api` for data fetching with caching + revalidation.
// =============================================================================

import useSWR, { type SWRConfiguration } from "swr";
import { api } from "./api";
import {
  emptyPortfolio,
  getRecentLaunchToken,
  normalizeToken,
  recentCreatedTokens,
  recentLaunchesPage,
  recentTrendingTokens,
  recentWalletTransactions,
} from "./recentLaunches";
import type {
  ChartTimeframe,
  TokenListParams,
  UserProfile,
} from "./types";

const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  shouldRetryOnError: false,
  dedupingInterval: 5_000,
};

export function useTokens(params: TokenListParams = {}, config: SWRConfiguration = {}) {
  const key = ["tokens", params] as const;
  return useSWR(
    key,
    async ([, p]) => {
      try {
        const page = await api.tokens.list(p);
        return {
          ...page,
          items: page.items.map(normalizeToken),
        };
      } catch (err) {
        console.warn("Token indexer unavailable; using recent launch cache.", err);
        return recentLaunchesPage(p);
      }
    },
    { ...defaultConfig, ...config },
  );
}

export function useTrendingTokens(limit = 6, config: SWRConfiguration = {}) {
  return useSWR(["trending", limit] as const, async ([, l]) => {
    try {
      return (await api.tokens.trending(l)).map(normalizeToken);
    } catch (err) {
      console.warn("Trending token indexer unavailable; using recent launch cache.", err);
      return recentTrendingTokens(l);
    }
  }, {
    ...defaultConfig,
    ...config,
  });
}

export function useToken(id: string | null | undefined, config: SWRConfiguration = {}) {
  return useSWR(id ? (["token", id] as const) : null, async ([, i]) => {
    try {
      return normalizeToken(await api.tokens.get(i));
    } catch (err) {
      console.warn("Token metadata unavailable; using recent launch cache.", err);
      const cached = getRecentLaunchToken(i);
      if (cached) return cached;
      throw err;
    }
  }, {
    ...defaultConfig,
    refreshInterval: 3_000,
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
    async ([, i, t]) => {
      try {
        return await api.tokens.chart(i!, t);
      } catch (err) {
        console.warn("Token chart unavailable; showing empty chart.", err);
        return [];
      }
    },
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
    async ([, i, l]) => {
      try {
        return await api.tokens.transactions(i!, l);
      } catch (err) {
        console.warn("Token transactions unavailable; showing empty history.", err);
        return [];
      }
    },
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
    async ([, w]) => {
      try {
        return await api.user.portfolio(w!);
      } catch (err) {
        console.warn("Indexer temporarily unavailable; showing local portfolio fallback.", err);
        return emptyPortfolio(w!);
      }
    },
    { ...defaultConfig, ...config },
  );
}

export function useUserProfile(
  wallet: string | null | undefined,
  config: SWRConfiguration = {},
) {
  return useSWR(
    wallet ? (["profile", wallet] as const) : null,
    async ([, w]) => {
      try {
        return await api.user.profile(w!);
      } catch (err) {
        console.warn("Indexer temporarily unavailable; showing local profile fallback.", err);
        return {
          wallet: w!,
          createdTokens: recentCreatedTokens(w!),
          createdLaunches: recentCreatedTokens(w!),
          contributedLaunches: [],
          claimedTokens: [],
          claimableTokens: [],
          creatorAllocations: [],
          contributions: [],
          transactions: recentWalletTransactions(w!),
          claimable: [],
          refundable: [],
          portfolio: emptyPortfolio(w!),
        } satisfies UserProfile;
      }
    },
    { ...defaultConfig, refreshInterval: 15_000, ...config },
  );
}

export function useUserCreated(
  wallet: string | null | undefined,
  config: SWRConfiguration = {},
) {
  return useSWR(
    wallet ? (["created", wallet] as const) : null,
    async ([, w]) => {
      try {
        return (await api.user.created(w!)).map(normalizeToken);
      } catch (err) {
        console.warn("Indexer temporarily unavailable; showing locally saved launches.", err);
        return recentCreatedTokens(w!);
      }
    },
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
    async ([, w, l]) => {
      try {
        return await api.user.transactions(w!, l);
      } catch (err) {
        console.warn("Indexer temporarily unavailable; showing local transaction fallback.", err);
        return recentWalletTransactions(w!).slice(0, l);
      }
    },
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

export function useWalletBalance(
  wallet: string | null | undefined,
  config: SWRConfiguration = {},
) {
  return useSWR(
    wallet ? (["walletBalance", wallet] as const) : null,
    async ([, w]) => {
      try {
        return await api.wallet.balance(w!);
      } catch (err) {
        console.warn("Wallet balance unavailable.", err);
        throw err;
      }
    },
    { ...defaultConfig, refreshInterval: 30_000, ...config },
  );
}
