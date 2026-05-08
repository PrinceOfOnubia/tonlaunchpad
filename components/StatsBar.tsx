"use client";

import { Activity, Coins, Droplets, Users } from "lucide-react";
import { usePlatformStats } from "@/lib/hooks";
import { cn, formatCompact, formatTon } from "@/lib/utils";

export function StatsBar() {
  const { data, isLoading } = usePlatformStats();

  const items = [
    {
      icon: Coins,
      label: "Tokens Launched",
      value: data ? formatCompact(data.totalTokens, 0) : null,
    },
    {
      icon: Users,
      label: "Active Users",
      value: data ? formatCompact(data.totalUsers, 0) : null,
    },
    {
      icon: Activity,
      label: "Total Volume",
      value: data ? formatTon(data.totalVolumeTon, 1) : null,
    },
    {
      icon: Droplets,
      label: "Liquidity Locked",
      value: data ? formatTon(data.totalLiquidityTon, 1) : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="glass p-4">
          <item.icon size={18} className="text-ton-500" />
          <div className="mt-2 font-display text-2xl font-bold text-ink-900">
            {item.value ?? <Skeleton wide={isLoading} />}
          </div>
          <div className="text-xs font-medium text-ink-500">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function Skeleton({ wide }: { wide: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-7 rounded bg-ink-100",
        wide ? "w-20 animate-pulse" : "w-20",
      )}
    />
  );
}
