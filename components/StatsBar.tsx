"use client";

import { Coins, CircleDollarSign, TrendingUp } from "lucide-react";
import { usePlatformStats } from "@/lib/hooks";
import { formatCompact, formatTon } from "@/lib/utils";

/**
 * Order matches the production design:
 *   Tokens Launched · Total Raised · 24h Volume
 *
 * When the backend is offline (no NEXT_PUBLIC_API_URL or fetch fails) we render
 * an em-dash so the UI degrades gracefully without showing fake numbers.
 */
export function StatsBar() {
  const { data, isLoading } = usePlatformStats();

  const items = [
    {
      icon: Coins,
      label: "Tokens Launched",
      value: data ? formatCompact(data.totalTokens, 0) : null,
    },
    {
      icon: CircleDollarSign,
      label: "Total Raised",
      value: data ? formatTon(data.totalRaisedTon, 1) : null,
    },
    {
      icon: TrendingUp,
      label: "24h Volume",
      value: data ? formatTon(data.totalVolumeTon, 1) : null,
      note: data?.note,
    },
  ];

  return (
    <div className="glass grid grid-cols-1 divide-ink-100 sm:grid-cols-3 sm:divide-x">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 p-4 sm:p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ton-50 text-ton-500 ring-1 ring-inset ring-ton-100">
            <item.icon size={18} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              {item.label}
            </div>
            <div className="font-display text-xl font-bold leading-tight text-ink-900 sm:text-2xl">
              {isLoading ? (
                <span className="inline-block h-7 w-16 animate-pulse rounded bg-ink-100" />
              ) : (
                item.value ?? <span className="text-ink-300">—</span>
              )}
            </div>
            {item.note && (
              <div className="mt-0.5 text-[10px] font-medium text-amber-600">
                Volume data coming soon
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
