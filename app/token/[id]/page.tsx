"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AtSign, ExternalLink, Globe, Loader2, Send, Music2 } from "lucide-react";
import { useToken } from "@/lib/hooks";
import { cn, formatCompact, formatPercent, formatPrice, formatTon, shortAddress } from "@/lib/utils";
import { TokenChart } from "@/components/TokenChart";
import { PresalePanel } from "@/components/PresalePanel";
import { PresaleProgress } from "@/components/PresaleProgress";
import { TransactionHistory } from "@/components/TransactionHistory";
import type { Token } from "@/lib/types";
import { useEffectivePresale } from "@/lib/presaleStatus";

export default function TokenPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: token, isLoading, error } = useToken(id);

  useEffect(() => {
    if (token) {
      console.debug("[token-page] received pool address", {
        id: token.id,
        presalePoolAddress: token.presalePoolAddress ?? null,
        tokenMasterAddress: token.address ?? null,
      });
    }
  }, [token]);

  if (isLoading) {
    return (
      <div className="container-page flex h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-ton-500" size={36} />
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="container-page py-20">
        <div className="glass mx-auto max-w-md p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-ink-900">Token not found</h2>
          <p className="mt-2 text-sm text-ink-500">
            We couldn&apos;t load this token. It may not exist or the API is unreachable.
          </p>
          <Link href="/tokens" className="btn-ghost mt-5 inline-flex">
            <ArrowLeft size={16} /> Back to tokens
          </Link>
        </div>
      </div>
    );
  }

  return <TokenContent token={token} />;
}

function TokenContent({ token }: { token: Token }) {
  const presale = useEffectivePresale(token.presale);
  const effectiveToken = { ...token, presale };
  const isLive = presale.status === "live" || presale.status === "upcoming";

  return (
    <div className="container-page py-8 sm:py-12">
      <Link
        href="/tokens"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ton-600"
      >
        <ArrowLeft size={14} /> All tokens
      </Link>

      <TokenHeader token={effectiveToken} />
      {process.env.NODE_ENV !== "production" && (
        <div className="mt-3 grid gap-1 rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-500 ring-1 ring-ink-100">
          <div>Factory: {effectiveToken.factoryAddress || effectiveToken.address || "missing"}</div>
          <div>Launch ID: {effectiveToken.id}</div>
          <div>Pool: {effectiveToken.presalePoolAddress || "missing"}</div>
          <div>Token Master: {effectiveToken.tokenMasterAddress || effectiveToken.address || "missing"}</div>
          <div>Backend record updated: {effectiveToken.presalePoolAddress ? "yes" : "no"}</div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {!isLive && <TokenChart tokenId={token.id} />}
          {isLive && <PresaleProgress presale={presale} variant="detailed" />}

          <Tokenomics token={effectiveToken} />

          {!isLive && <PresaleProgress presale={presale} variant="detailed" />}

          <TransactionHistory tokenId={effectiveToken.id} symbol={effectiveToken.symbol} />
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <PresalePanel token={effectiveToken} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenHeader({ token }: { token: Token }) {
  const positive = token.priceChange24h >= 0;
  const [imageFailed, setImageFailed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const initials = (token.symbol || "TK").slice(0, 2).toUpperCase();

  return (
    <div className="glass overflow-hidden">
      {/* Banner — uploaded cover, or subtle gradient fallback */}
      {token.bannerUrl && !bannerFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={token.bannerUrl}
          alt=""
          onError={() => setBannerFailed(true)}
          className="h-32 w-full object-cover sm:h-40"
        />
      ) : (
        <div className="h-32 w-full bg-gradient-to-br from-ton-100 via-ton-50 to-white sm:h-40" />
      )}

      <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-4">
        {token.imageUrl && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.imageUrl}
            alt={token.name || token.symbol || "Token logo"}
            onError={() => setImageFailed(true)}
            className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white shadow-sm"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ton-gradient font-display text-xl font-bold text-white ring-2 ring-white">
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              {token.name}
            </h1>
            <span className="rounded-md bg-ink-100 px-2 py-0.5 font-mono text-sm font-semibold text-ink-700">
              {token.symbol}
            </span>
          </div>
          {token.description && (
            <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{token.description}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {token.address && (
              <a
                href={`https://tonviewer.com/${token.address}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-1 font-mono text-ink-600 hover:bg-ink-200"
              >
                {shortAddress(token.address, 6, 4)}
                <ExternalLink size={11} />
              </a>
            )}
            {token.social.website && (
              <a
                href={token.social.website}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-ink-500 hover:text-ton-600"
              >
                <Globe size={13} /> Website
              </a>
            )}
            {token.social.twitter && (
              <a
                href={`https://twitter.com/${token.social.twitter.replace("@", "")}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-ink-500 hover:text-ton-600"
              >
                <AtSign size={13} /> Twitter
              </a>
            )}
            {token.social.telegram && (
              <a
                href={`https://${token.social.telegram.replace(/^https?:\/\//, "")}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-ink-500 hover:text-ton-600"
              >
                <Send size={13} /> Telegram
              </a>
            )}
            {token.social.youtube && (
              <a
                href={normalizeUrl(token.social.youtube)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-ink-500 hover:text-ton-600"
              >
                <Globe size={13} /> YouTube
              </a>
            )}
            {token.social.tiktok && (
              <a
                href={normalizeUrl(token.social.tiktok)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-ink-500 hover:text-ton-600"
              >
                <Music2 size={13} /> TikTok
              </a>
            )}
            {token.social.github && (
              <a
                href={normalizeUrl(token.social.github)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-ink-500 hover:text-ton-600"
              >
                <Globe size={13} /> GitHub
              </a>
            )}
          </div>
        </div>

        {/* Market stats appear after presale finalizes */}
        {token.presale.status === "finalized" && (
          <div className="grid w-full grid-cols-2 gap-4 border-t border-ink-100 pt-4 sm:w-auto sm:border-0 sm:pt-0">
            <Stat label="Price" value={formatPrice(token.price)} />
            <Stat
              label="24h"
              value={formatPercent(token.priceChange24h)}
              valueClass={positive ? "text-emerald-600" : "text-red-600"}
            />
            <Stat label="MCap" value={`$${formatCompact(token.marketCap)}`} />
            <Stat label="Volume" value={formatTon(token.volume24h)} />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/** Add https:// when user enters a bare domain like "youtube.com/@x". */
function normalizeUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input.replace(/^\/+/, "")}`;
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
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-400">{label}</div>
      <div className={cn("font-mono text-base font-semibold text-ink-900", valueClass)}>
        {value}
      </div>
    </div>
  );
}

function Tokenomics({ token }: { token: Token }) {
  const a = token.allocations;
  return (
    <div className="glass p-6">
      <h3 className="font-display text-lg font-semibold text-ink-900">Tokenomics</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2.5">
          <Row label="Total supply" value={token.totalSupply.toLocaleString()} />
          <Row label="Decimals" value={String(token.decimals)} />
          <Row label="Manual liquidity plan" value={`${token.liquidityPercent}% of raise`} />
        </div>
        <div className="space-y-2.5">
          <AllocBar label="Presale" pct={a.presale} color="bg-ton-500" />
          <AllocBar label="Liquidity" pct={a.liquidity} color="bg-ton-300" />
          <AllocBar label="Creator" pct={a.creator} color="bg-ton-700" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="font-mono font-semibold text-ink-900">{value}</span>
    </div>
  );
}

function AllocBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-600">{label}</span>
        <span className="font-mono font-semibold text-ink-900">{pct}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
