"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useTrendingTokens } from "@/lib/hooks";
import { TokenCard } from "./TokenCard";

export function TrendingTokens() {
  const { data, isLoading, error } = useTrendingTokens(6);

  return (
    <section className="container-page py-12">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold text-ink-900">Trending Now</h2>
          <p className="mt-1 text-sm text-ink-500">Hot presales picking up momentum</p>
        </div>
        <Link
          href="/tokens"
          className="text-sm font-semibold text-ton-600 hover:text-ton-700"
        >
          View all →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="animate-spin text-ton-500" size={28} />
        </div>
      ) : error ? (
        <EmptyState>Couldn&apos;t load trending tokens</EmptyState>
      ) : !data || data.length === 0 ? (
        <EmptyState>
          No trending tokens yet — be the first to{" "}
          <Link href="/create" className="font-semibold text-ton-600 hover:text-ton-700">
            launch one
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t) => (
            <TokenCard key={t.id} token={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass flex h-48 items-center justify-center text-sm text-ink-500">
      {children}
    </div>
  );
}
