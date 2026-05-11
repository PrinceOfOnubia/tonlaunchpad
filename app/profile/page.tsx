"use client";

import { useState } from "react";
import Link from "next/link";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { Check, Copy, ExternalLink, Loader2, Wallet } from "lucide-react";
import { useUserProfile, useWalletBalance } from "@/lib/hooks";
import { TokenCard } from "@/components/TokenCard";
import { cn, formatPercent, formatTon, shortAddress, timeAgo } from "@/lib/utils";
import { isExplorerSafeTxHash, tonviewerUrl } from "@/lib/explorer";
import type { PortfolioHolding, ProfileLaunchPosition, Transaction, TxKind } from "@/lib/types";

type Tab = "portfolio" | "created" | "contributions" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "portfolio", label: "My Portfolio" },
  { id: "created", label: "My Created Tokens" },
  { id: "contributions", label: "My Contributions" },
  { id: "history", label: "My Transactions" },
];

export default function ProfilePage() {
  const wallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [tab, setTab] = useState<Tab>("portfolio");
  const [copied, setCopied] = useState(false);
  const { data: balance, isLoading: balanceLoading } = useWalletBalance(wallet);

  async function copyWallet() {
    await navigator.clipboard.writeText(wallet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

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
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
          {shortAddress(wallet, 8, 6)}
        </h1>
        <button
          type="button"
          onClick={copyWallet}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-semibold text-ink-600 ring-1 ring-ink-200 transition-colors hover:bg-ink-50"
          aria-label="Copy wallet address"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-2 text-sm text-ink-500">
        Balance:{" "}
        <span className="font-mono font-semibold text-ink-800">
          {balanceLoading ? "Loading..." : balance ? formatTon(balance.balanceTon, 2) : "Unavailable"}
        </span>
      </div>

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
        {tab === "contributions" && <ContributionsTab wallet={wallet} />}
        {tab === "history" && <HistoryTab wallet={wallet} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function PortfolioTab({ wallet }: { wallet: string }) {
  const { data, isLoading, error } = useUserProfile(wallet);
  const portfolio = data?.portfolio;

  if (isLoading) return <CenterSpinner />;
  if (error) return <Empty>Failed to load portfolio</Empty>;
  if (!portfolio || portfolio.holdings.length === 0) {
    return <Empty>No portfolio positions yet</Empty>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Total value" value={formatTon(portfolio.totalValueTon)} />
        <Stat
          label="P&L"
          value={formatPercent(portfolio.pnlPercent)}
          valueClass={portfolio.pnlPercent >= 0 ? "text-emerald-600" : "text-red-600"}
        />
      </div>

      <div className="glass overflow-hidden">
        <ul className="divide-y divide-ink-100">
          {portfolio.holdings.map((h, index) => (
            <HoldingRow key={`${h.tokenId}-${h.allocationType ?? "holding"}-${index}`} h={h} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function HoldingRow({ h }: { h: PortfolioHolding }) {
  const allocationLabel =
    h.allocationType === "wallet"
      ? "Wallet balance"
      : h.allocationType === "projected_creator"
        ? "Expected creator allocation"
        : h.allocationType === "claimable"
          ? "Claimable from presale"
          : h.allocationType === "presale"
            ? "Presale position"
            : null;

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
          {allocationLabel ? (
            <div className="mt-0.5 text-[11px] text-ink-400">{allocationLabel}</div>
          ) : null}
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
  const { data, isLoading, error } = useUserProfile(wallet);
  const created = data?.createdLaunches ?? data?.createdTokens ?? [];
  if (isLoading) return <CenterSpinner />;
  if (error) return <Empty>Failed to load your tokens</Empty>;
  if (created.length === 0) {
    return <Empty>No created tokens yet</Empty>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {created.map((t) => (
        <TokenCard key={t.id} token={t} />
      ))}
    </div>
  );
}

function ContributionsTab({ wallet }: { wallet: string }) {
  const { data, isLoading, error } = useUserProfile(wallet);
  const contributions = data?.contributedLaunches ?? data?.contributions ?? [];

  if (isLoading) return <CenterSpinner />;
  if (error) return <Empty>Failed to load contributions</Empty>;
  if (contributions.length === 0) return <Empty>No contributions yet</Empty>;

  return (
    <div className="glass overflow-hidden">
      <ul className="divide-y divide-ink-100">
        {contributions.map((position, index) => (
          <ContributionRow key={`${position.launch.id}-${position.transaction?.id ?? index}`} position={position} />
        ))}
      </ul>
    </div>
  );
}

function HistoryTab({ wallet }: { wallet: string }) {
  const { data, isLoading, error } = useUserProfile(wallet);
  const transactions = data?.transactions ?? [];
  if (isLoading) return <CenterSpinner />;
  if (error) return <Empty>Failed to load transactions</Empty>;
  if (transactions.length === 0) return <Empty>No transactions yet</Empty>;

  return (
    <div className="glass overflow-hidden">
      <ul className="divide-y divide-ink-100">
        {transactions.map((tx) => (
          <TxRow key={tx.id} tx={tx} />
        ))}
      </ul>
    </div>
  );
}

const TX_LABEL: Record<TxKind, { label: string; color: string }> = {
  launch: { label: "Launched", color: "text-ton-700" },
  contribute: { label: "Contributed", color: "text-ton-700" },
  claim: { label: "Claimed", color: "text-emerald-700" },
  refund: { label: "Refunded", color: "text-amber-700" },
  treasury: { label: "Treasury", color: "text-violet-700" },
  buy: { label: "Bought", color: "text-emerald-700" },
  sell: { label: "Sold", color: "text-red-700" },
};

function TxRow({ tx }: { tx: Transaction }) {
  const meta = TX_LABEL[tx.kind];
  const explorer = tonviewerUrl({ txHash: tx.hash, address: tx.relatedAddress ?? tx.wallet });
  return (
    <li className="flex items-center justify-between px-5 py-3">
      <div>
        <div className={cn("text-sm font-semibold", meta.color)}>
          {meta.label}
          {tx.tokenSymbol ? <span className="ml-2 text-ink-700">{tx.tokenSymbol}</span> : null}
        </div>
        <div className="text-xs text-ink-500">
          {tx.tokenName ? `${tx.tokenName} · ` : ""}
          {timeAgo(tx.timestamp)} · {isExplorerSafeTxHash(tx.hash) ? shortAddress(tx.hash!, 6, 4) : "Pending"}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right font-mono text-sm">
          <div className="font-semibold text-ink-900">{formatTon(tx.amountTon)}</div>
          <div className="text-xs text-ink-500">
            {tx.amountToken.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
          </div>
        </div>
        <a
          href={explorer}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-md p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ton-600"
          aria-label="Open in Tonviewer"
        >
          <ExternalLink size={15} />
        </a>
      </div>
    </li>
  );
}

function ContributionRow({ position }: { position: ProfileLaunchPosition }) {
  const tx = position.transaction;
  const explorer = tonviewerUrl({
    txHash: tx?.hash,
    address: tx?.relatedAddress ?? position.launch.presalePoolAddress ?? position.launch.address,
  });
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-3">
      <Link href={`/token/${position.launch.id}`} className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink-900">
          {position.launch.name}
          <span className="ml-2 font-mono text-xs text-ink-500">{position.launch.symbol}</span>
        </div>
        <div className="text-xs text-ink-500">
          {tx ? timeAgo(tx.timestamp) : "Position recorded"}
        </div>
      </Link>
      <div className="flex items-center gap-3">
        <div className="text-right font-mono text-sm">
          <div className="font-semibold text-ink-900">{formatTon(position.amountTon ?? tx?.amountTon ?? 0)}</div>
          <div className="text-xs text-ink-500">
            {(position.tokenAmount ?? tx?.amountToken ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens
          </div>
        </div>
        <a
          href={explorer}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-md p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ton-600"
          aria-label="Open in Tonviewer"
        >
          <ExternalLink size={15} />
        </a>
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
