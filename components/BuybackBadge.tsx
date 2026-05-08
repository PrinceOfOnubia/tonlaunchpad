import { cn } from "@/lib/utils";
import { formatBuybackRate } from "@/lib/buyback";
import type { BuybackConfig } from "@/lib/types";
import { Repeat2 } from "lucide-react";

interface Props {
  buyback: BuybackConfig;
  className?: string;
  variant?: "card" | "pill";
}

/**
 * Visual badge for buyback config.
 * `pill` — tiny inline tag (used in token cards)
 * `card` — full block (used on detail page)
 */
export function BuybackBadge({ buyback, className, variant = "pill" }: Props) {
  if (!buyback.enabled) {
    if (variant === "pill") {
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500",
            className,
          )}
        >
          No buybacks
        </span>
      );
    }
    return (
      <div
        className={cn(
          "glass flex items-center gap-3 p-4",
          "border border-ink-100",
          className,
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-400">
          <Repeat2 size={18} />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-700">Buybacks disabled</div>
          <div className="text-xs text-ink-500">Creator opted out of programmatic buybacks</div>
        </div>
      </div>
    );
  }

  if (variant === "pill") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-ton-50 px-2 py-0.5 text-[11px] font-medium text-ton-700 ring-1 ring-inset ring-ton-200",
          className,
        )}
      >
        <Repeat2 size={11} />
        {buyback.percent}% buybacks
      </span>
    );
  }

  return (
    <div
      className={cn(
        "glass relative overflow-hidden p-5",
        "ring-1 ring-ton-200",
        className,
      )}
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-ton-500/10 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ton-100 text-ton-600">
          <Repeat2 size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-ink-500">Programmatic Buybacks</div>
          <div className="mt-0.5 text-2xl font-bold text-ink-900 font-display">
            {buyback.percent}%
            <span className="ml-1.5 text-sm font-normal text-ink-500">of treasury</span>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-ton-700 ring-1 ring-inset ring-ton-100">
            <span className="h-1.5 w-1.5 rounded-full bg-ton-500 animate-pulse" />
            {formatBuybackRate(buyback.rate)}
          </div>
        </div>
      </div>
    </div>
  );
}
