import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Token } from "@/lib/types";
import { cn, formatCompact, formatPercent, formatPrice, formatTon } from "@/lib/utils";
import { PresaleProgress } from "./PresaleProgress";
import { BuybackBadge } from "./BuybackBadge";

interface Props {
  token: Token;
  className?: string;
}

const STATUS_COLOR: Record<string, string> = {
  upcoming: "bg-amber-100 text-amber-700",
  live: "bg-emerald-100 text-emerald-700",
  succeeded: "bg-ton-100 text-ton-700",
  failed: "bg-red-100 text-red-700",
  finalized: "bg-violet-100 text-violet-700",
};

export function TokenCard({ token, className }: Props) {
  const isLive = token.presale.status === "live" || token.presale.status === "upcoming";
  const positive = token.priceChange24h >= 0;

  return (
    <Link
      href={`/token/${token.id}`}
      className={cn(
        "group glass relative block overflow-hidden p-5 transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-glow-ton hover:ring-1 hover:ring-ton-200",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <TokenAvatar token={token} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-semibold text-ink-900">
              {token.name}
            </h3>
            <span className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-600">
              {token.symbol}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                STATUS_COLOR[token.presale.status] ?? STATUS_COLOR.upcoming,
              )}
            >
              {token.presale.status}
            </span>
            <BuybackBadge buyback={token.buyback} />
          </div>
        </div>
      </div>

      {isLive ? (
        <div className="mt-4">
          <PresaleProgress presale={token.presale} variant="compact" />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3 text-xs">
          <div>
            <div className="text-ink-500">Price</div>
            <div className="font-semibold text-ink-900">{formatPrice(token.price)}</div>
          </div>
          <div>
            <div className="text-ink-500">24h</div>
            <div
              className={cn(
                "flex items-center gap-1 font-semibold",
                positive ? "text-emerald-600" : "text-red-600",
              )}
            >
              {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {formatPercent(token.priceChange24h)}
            </div>
          </div>
          <div>
            <div className="text-ink-500">MCap</div>
            <div className="font-semibold text-ink-900">${formatCompact(token.marketCap)}</div>
          </div>
          <div>
            <div className="text-ink-500">Volume 24h</div>
            <div className="font-semibold text-ink-900">{formatTon(token.volume24h)}</div>
          </div>
        </div>
      )}
    </Link>
  );
}

function TokenAvatar({ token }: { token: Token }) {
  const initials = token.symbol.slice(0, 2).toUpperCase();
  if (token.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.imageUrl}
        alt={token.name}
        className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ton-gradient font-display text-sm font-bold text-white ring-2 ring-white">
      {initials}
    </div>
  );
}
