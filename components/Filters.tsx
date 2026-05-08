"use client";

import { Search } from "lucide-react";
import { useFilterStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { SortBy, TokenListStatus } from "@/lib/types";

const STATUSES: { id: TokenListStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "upcoming", label: "Upcoming" },
  { id: "trending", label: "Trending" },
  { id: "concluded", label: "Concluded" },
];

const SORTS: { id: SortBy; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "raised", label: "Raised" },
  { id: "marketCap", label: "Market Cap" },
  { id: "volume24h", label: "Volume 24h" },
];

export function Filters() {
  const { search, status, sortBy, setSearch, setStatus, setSortBy } = useFilterStore();

  return (
    <div className="glass flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or symbol…"
          className="input-base pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatus(s.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              status === s.id
                ? "bg-ton-600 text-white shadow-sm"
                : "bg-ink-100 text-ink-600 hover:bg-ink-200",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as SortBy)}
        className="input-base lg:w-44"
      >
        {SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            Sort: {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
