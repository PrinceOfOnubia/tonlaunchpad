import { cn, formatTon, timeUntil } from "@/lib/utils";
import type { PresaleInfo } from "@/lib/types";
import { Users, Clock } from "lucide-react";

interface Props {
  presale: PresaleInfo;
  /** Compact = inline in cards. Detailed = on token detail page. */
  variant?: "compact" | "detailed";
  className?: string;
}

const STATUS_COLOR: Record<string, string> = {
  upcoming: "bg-amber-100 text-amber-700 ring-amber-200",
  live: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  succeeded: "bg-ton-100 text-ton-700 ring-ton-200",
  failed: "bg-red-100 text-red-700 ring-red-200",
  finalized: "bg-violet-100 text-violet-700 ring-violet-200",
};

export function PresaleProgress({ presale, variant = "compact", className }: Props) {
  const pct = Math.min(100, presale.hardCap > 0 ? (presale.raised / presale.hardCap) * 100 : 0);
  const softPct =
    presale.hardCap > 0 ? Math.min(100, (presale.softCap / presale.hardCap) * 100) : 0;
  const softReached = presale.raised >= presale.softCap;

  if (variant === "compact") {
    return (
      <div className={cn("space-y-1.5", className)}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-ink-500">Presale</span>
          <span className="font-mono font-medium text-ink-700">{pct.toFixed(1)}%</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ton-500 to-ton-400 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
          {/* Soft cap marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-ink-400/60"
            style={{ left: `${softPct}%` }}
            aria-label="soft cap marker"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-500">
          <span>{formatTon(presale.raised)} raised</span>
          <span>{formatTon(presale.hardCap)} cap</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("glass space-y-4 p-6", className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-ink-500">Presale Progress</div>
          <div className="mt-1 text-3xl font-bold tracking-tight text-ink-900 font-display">
            {formatTon(presale.raised)}
            <span className="ml-2 text-base font-normal text-ink-500">
              of {formatTon(presale.hardCap)}
            </span>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset",
            STATUS_COLOR[presale.status] ?? STATUS_COLOR.upcoming,
          )}
        >
          {presale.status}
        </span>
      </div>

      <div className="space-y-2">
        <div className="relative h-3 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ton-500 via-ton-400 to-ton-300 shadow-[0_0_12px_rgba(0,152,234,0.4)] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-0 h-full w-0.5 bg-ink-500"
            style={{ left: `${softPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <div
            className={cn(
              "flex items-center gap-1.5 font-medium",
              softReached ? "text-emerald-600" : "text-ink-500",
            )}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                softReached ? "bg-emerald-500" : "bg-ink-300",
              )}
            />
            Soft cap {formatTon(presale.softCap)}
            {softReached && " · reached"}
          </div>
          <div className="font-mono font-semibold text-ton-600">{pct.toFixed(2)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-ink-100 pt-4">
        <div className="flex items-center gap-2 text-sm">
          <Users size={16} className="text-ink-400" />
          <div>
            <div className="font-semibold text-ink-900">
              {presale.contributors.toLocaleString()}
            </div>
            <div className="text-xs text-ink-500">contributors</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock size={16} className="text-ink-400" />
          <div>
            <div className="font-semibold text-ink-900">
              {presale.status === "live" ? timeUntil(presale.endTime) : "—"}
            </div>
            <div className="text-xs text-ink-500">
              {presale.status === "upcoming" ? "starts in" : "remaining"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
