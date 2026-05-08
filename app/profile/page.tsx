"use client";

import { useState } from "react";
import Link from "next/link";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { Loader2, Wallet } from "lucide-react";
import { useUserPortfolio, useUserCreated, useUserTransactions } from "@/lib/hooks";
import { TokenCard } from "@/components/TokenCard";
import { cn, formatPercent, formatTon, shortAddress, timeAgo } from "@/lib/utils";
import type { PortfolioHolding, Transaction, TxKind } from "@/lib/types";

type Tab = "portfolio" | "created" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "portfolio", label: "Portfolio" },
  { id: "created", label: "My Tokens" },
  { id: "history", label: "Transactions" },
];

export default function ProfilePage() {
  const wallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [tab, setTab] = useState<Tab>("portfolio");

  if (!wallet) {
    return (
      <div className="container-page py-20">
        <div className="glass mx-auto max-w-md p-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ton-100 text-ton-600">
            <Wallet size={24} />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold text-ink-900">
            Connect your wallet
          </h2>
          <p className="mt-2 text-sm text-ink-500">
            View your holdings, created tokens, and transaction history.
          </p>
          <button onClick={() => tonConnectUI.openModal()} className="btn-primary mt-6 w-full">
            <Wallet size={16} /> Connect TON Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <div className="mb-2 text-xs font-medium text-ink-500">Connected wallet</div>
      <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
        {shortAddress(wallet, 8, 6)}
      </h1>

      <div className="mt-6 flex gap-1.5 overflow-x-auto rounded-xl bg-ink-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              tab === t.id
                ? "bg-white text-ton-700 shadow-sm"
                : "text-ink-500 hover:text-ink-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "portfolio" && <PortfolioTab wallet={wallet} />}
        {tab === "created" && <CreatedTab wallet={wallet} />}
        {tab === "history" && <HistoryTab wallet={wallet} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function PortfolioTab({ wallet }: { wallet: string }) {
  const { data, isLoading, error } = useUserPortfolio(wallet);

  if (isLoading) return <CenterSpinner />;
  if (error) return <Empty>Failed to load portfolio</Empty>;
  if (!data || data.holdings.length === 0) {
    return (
      <Empty>
        No holdings yet.{" "}
        <Link href="/tokens" className="font-semibold text-ton-600 hover:text-ton-700">
          Discover tokens →
        </Link>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Total value" value={formatTon(data.totalValueTon)} />
        <Stat
          label="P&L"
          value={formatPercent(data.pnlPercent)}
          valueClass={data.pnlPercent >= 0 ? "text-emerald-600" : "text-red-600"}
        />
      </div>

      <div className="glass overflow-hidden">
        <ul className="divide-y divide-ink-100">
          {data.holdings.map((h) => (
            <HoldingRow key={h.tokenId} h={h} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function HoldingRow({ h }: { h: PortfolioHolding }) {
  return (
    <Link
      href={`/token/${h.tokenId}`}
      className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/60"
    >
      {h.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={h.imageUrl} alt={h.name} className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ton-gradient text-xs font-bold text-white">
          {h.symbol.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink-900">{h.name}</div>
        <div className="font-mono text-xs text-ink-500">
          {h.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {h.symbol}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-semibold text-ink-900">{formatTon(h.valueTon)}</div>
        <div
          className={cn(
            "font-mono text-xs",
            h.pnlPercent >= 0 ? "text-emerald-600" : "text-red-600",
          )}
        >
          {formatPercent(h.pnlPercent)}
        </div>
      </div>
    </Link>
  );
}

function CreatedTab({ wallet }: { wallet: string }) {
  const { data, isLoading, error } = useUserCreated(wallet);
  if (isLoading) return <CenterSpinner />;
  if (error) return <Empty>Failed to load your tokens</Empty>;
  if (!data || data.length === 0) {
    return (
      <Empty>
        You haven&apos;t launched any tokens yet.{" "}
        <Link href="/create" className="font-semibold text-ton-600 hover:text-ton-700">
          Create one →
        </Link>
      </Empty>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((t) => (
        <TokenCard key={t.id} token={t} />
      ))}
    </div>
  );
}

function HistoryTab({ wallet }: { wallet: string }) {
  const { data, isLoading, error } = useUserTransactions(wallet);
  if (isLoading) return <CenterSpinner />;
  if (error) return <Empty>Failed to load transactions</Empty>;
  if (!data || data.length === 0) return <Empty>No transactions yet</Empty>;

  return (
    <div className="glass overflow-hidden">
      <ul className="divide-y divide-ink-100">
        {data.map((tx) => (
          <TxRow key={tx.id} tx={tx} />
        ))}
      </ul>
    </div>
  );
}

const TX_LABEL: Record<TxKind, { label: string; color: string }> = {
  contribute: { label: "Contributed", color: "text-ton-700" },
  claim: { label: "Claimed", color: "text-emerald-700" },
  refund: { label: "Refunded", color: "text-amber-700" },
  buy: { label: "Bought", color: "text-emerald-700" },
  sell: { label: "Sold", color: "text-red-700" },
  buyback: { label: "Buyback", color: "text-violet-700" },
};

function TxRow({ tx }: { tx: Transaction }) {
  const meta = TX_LABEL[tx.kind];
  return (
    <li className="flex items-center justify-between px-5 py-3">
      <div>
        <div className={cn("text-sm font-semibold", meta.color)}>{meta.label}</div>
        <div className="text-xs text-ink-500">
          {timeAgo(tx.timestamp)} · {shortAddress(tx.hash, 6, 4)}
        </div>
      </div>
      <div className="text-right font-mono text-sm">
        <div className="font-semibold text-ink-900">{formatTon(tx.amountTon)}</div>
        <div className="text-xs text-ink-500">
          {tx.amountToken.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function CenterSpinner() {
  return (
    <div className="flex h-72 items-center justify-center">
      <Loader2 className="animate-spin text-ton-500" size={28} />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass flex h-72 items-center justify-center px-8 text-center text-sm text-ink-500">
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="glass p-4">
      <div className="text-xs font-medium text-ink-500">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-bold text-ink-900", valueClass)}>
        {value}
      </div>
    </div>
  );
}
