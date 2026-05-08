"use client";

import { ArrowDownLeft, ArrowUpRight, Loader2, Repeat2 } from "lucide-react";
import { useTokenTransactions } from "@/lib/hooks";
import { cn, formatTon, shortAddress, timeAgo } from "@/lib/utils";
import type { Transaction, TxKind } from "@/lib/types";

export function TransactionHistory({ tokenId, symbol }: { tokenId: string; symbol: string }) {
  const { data, isLoading, error } = useTokenTransactions(tokenId);

  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 p-5">
        <h3 className="font-display text-lg font-semibold text-ink-900">Recent Transactions</h3>
        <span className="text-xs text-ink-500">
          {data ? `${data.length} latest` : ""}
        </span>
      </div>

      {isLoading ? (
        <EmptyRow>
          <Loader2 className="animate-spin text-ink-400" size={20} />
        </EmptyRow>
      ) : error ? (
        <EmptyRow>Failed to load transactions</EmptyRow>
      ) : !data || data.length === 0 ? (
        <EmptyRow>No transactions yet</EmptyRow>
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.map((tx) => (
            <TxRow key={tx.id} tx={tx} symbol={symbol} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-ink-500">{children}</div>
  );
}

function TxRow({ tx, symbol }: { tx: Transaction; symbol: string }) {
  const meta = META[tx.kind];
  return (
    <li className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/60">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          meta.bg,
          meta.fg,
        )}
      >
        <meta.icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
          {meta.label}
          <span className="font-mono text-[11px] text-ink-400">{shortAddress(tx.wallet)}</span>
        </div>
        <div className="text-xs text-ink-500">{timeAgo(tx.timestamp)}</div>
      </div>
      <div className="text-right text-sm">
        <div className="font-mono font-semibold text-ink-900">{formatTon(tx.amountTon)}</div>
        <div className="font-mono text-xs text-ink-500">
          {tx.amountToken.toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol}
        </div>
      </div>
    </li>
  );
}

const META: Record<TxKind, { icon: typeof ArrowDownLeft; label: string; bg: string; fg: string }> = {
  launch: { icon: ArrowUpRight, label: "Launch", bg: "bg-ton-100", fg: "text-ton-700" },
  contribute: { icon: ArrowDownLeft, label: "Contribute", bg: "bg-ton-100", fg: "text-ton-700" },
  claim: { icon: ArrowUpRight, label: "Claim", bg: "bg-emerald-100", fg: "text-emerald-700" },
  refund: { icon: ArrowUpRight, label: "Refund", bg: "bg-amber-100", fg: "text-amber-700" },
  migrate: { icon: Repeat2, label: "Migrate", bg: "bg-violet-100", fg: "text-violet-700" },
  buy: { icon: ArrowDownLeft, label: "Buy", bg: "bg-emerald-100", fg: "text-emerald-700" },
  sell: { icon: ArrowUpRight, label: "Sell", bg: "bg-red-100", fg: "text-red-700" },
  buyback: { icon: Repeat2, label: "Buyback", bg: "bg-violet-100", fg: "text-violet-700" },
};
