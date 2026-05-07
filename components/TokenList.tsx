"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useTokens } from "@/lib/hooks";
import { useFilterStore } from "@/lib/store";
import { TokenCard } from "./TokenCard";

export function TokenList() {
  const { search, status, sortBy } = useFilterStore();
  const { data, isLoading, error } = useTokens({
    search: search || undefined,
    status: status === "all" ? undefined : status,
    sortBy,
  });

  if (isLoading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="animate-spin text-ton-500" size={32} />
      </div>
    );
  }
  if (error) {
    return <Empty>Failed to load tokens. Check your API connection.</Empty>;
  }
  if (!data || data.items.length === 0) {
    return (
      <Empty>
        No tokens match your filters yet.{" "}
        <Link href="/create" className="font-semibold text-ton-600 hover:text-ton-700">
          Launch one →
        </Link>
      </Empty>
    );
  }

  return (
    <>
      <div className="mb-3 text-sm text-ink-500">
        {data.total.toLocaleString()} {data.total === 1 ? "token" : "tokens"}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.items.map((t) => (
          <TokenCard key={t.id} token={t} />
        ))}
      </div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass flex h-72 items-center justify-center px-8 text-center text-sm text-ink-500">
      {children}
    </div>
  );
}
