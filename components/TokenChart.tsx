"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartTimeframe, PricePoint } from "@/lib/types";
import { useTokenChart } from "@/lib/hooks";
import { cn, formatPrice } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const TIMEFRAMES: ChartTimeframe[] = ["1H", "1D", "1W", "1M", "ALL"];

export function TokenChart({ tokenId }: { tokenId: string }) {
  const [tf, setTf] = useState<ChartTimeframe>("1D");
  const { data, isLoading, error } = useTokenChart(tokenId, tf);

  const formatted = useMemo(
    () =>
      (data ?? []).map((p: PricePoint) => ({
        ...p,
        label: formatTimeLabel(p.t, tf),
      })),
    [data, tf],
  );

  return (
    <div className="glass p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink-900">Price</h3>
        <div className="flex gap-1 rounded-lg bg-ink-100 p-1">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                tf === t ? "bg-white text-ton-700 shadow-sm" : "text-ink-500 hover:text-ink-700",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72">
        {isLoading ? (
          <ChartState>
            <Loader2 className="animate-spin text-ink-400" size={24} />
          </ChartState>
        ) : error ? (
          <ChartState>Failed to load chart</ChartState>
        ) : !data || data.length === 0 ? (
          <ChartState>
            <div className="text-center">
              <div className="text-sm font-medium text-ink-700">No price data yet</div>
              <div className="mt-1 text-xs text-ink-500">
                Chart will populate after presale finalizes
              </div>
            </div>
          </ChartState>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0098EA" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0098EA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatPrice(v)}
                width={64}
                domain={["auto", "auto"]}
              />
              <Tooltip
                cursor={{ stroke: "#cbd5e1", strokeDasharray: 3 }}
                content={<CustomTooltip />}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#0098EA"
                strokeWidth={2}
                fill="url(#priceFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function ChartState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink-500">
      {children}
    </div>
  );
}

function CustomTooltip(props: { active?: boolean; payload?: Array<{ payload: PricePoint }> }) {
  if (!props.active || !props.payload?.length) return null;
  const p = props.payload[0].payload;
  return (
    <div className="rounded-lg bg-ink-900/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-sm">
      <div className="font-mono font-semibold">{formatPrice(p.price)}</div>
      <div className="mt-0.5 text-ink-300">{new Date(p.t).toLocaleString()}</div>
    </div>
  );
}

function formatTimeLabel(ts: number, tf: ChartTimeframe): string {
  const d = new Date(ts);
  if (tf === "1H" || tf === "1D") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
