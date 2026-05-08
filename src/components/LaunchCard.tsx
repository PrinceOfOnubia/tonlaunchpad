import Link from "next/link";
import { formatTon } from "@/lib/launches";
import type { Launch } from "@/types/launch";
import { LaunchOrb } from "@/components/LaunchOrb";
import { ProgressBar } from "@/components/ProgressBar";

export function LaunchCard({ launch, compact = false }: { launch: Launch; compact?: boolean }) {
  if (compact) {
    return (
      <Link
        href={`/token/${launch.id}`}
        className="cyan-edge group block rounded-md border border-[#0098ea]/10 bg-[#111827] p-3 pl-5 transition hover:border-[#0098ea]/35 hover:bg-[#131d2f] sm:p-4 sm:pl-5"
      >
        <div className="flex items-start gap-3">
          <LaunchOrb launch={launch} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-[0.95rem] font-black text-slate-100 sm:text-base">{launch.name}</h3>
                <p className="text-xs font-black text-[#8fd8ff]">${launch.ticker}</p>
              </div>
              <span className="text-sm font-black text-emerald-300">+0%</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-slate-400">
              <span>MC {formatTon(launch.marketCapTon)} TON</span>
              <span>V {formatTon(launch.volumeTon)}</span>
              <span>H {launch.holders}</span>
            </div>
            <div className="mt-3">
              <ProgressBar value={launch.progress} />
            </div>
            <p className="mt-2 text-right text-xs font-black text-[#8fd8ff]">{launch.progress}%</p>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/token/${launch.id}`}
      className="group block rounded-lg border border-[#0098ea]/10 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-[#0098ea]/35 hover:bg-[#0098ea]/[0.055]"
    >
      <div className="flex items-start gap-4">
        <LaunchOrb launch={launch} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="truncate text-lg font-black text-white">{launch.name}</h3>
              <p className="text-sm font-bold text-[#8fd8ff]">${launch.ticker}</p>
            </div>
            <span className="rounded bg-[#0098ea]/10 px-2 py-1 text-xs font-bold text-[#d7f2ff]">
              {launch.progress}%
            </span>
          </div>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">{launch.description}</p>
        </div>
      </div>
      <div className="mt-5">
        <ProgressBar value={launch.progress} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">Market cap</p>
          <p className="font-bold text-white">{formatTon(launch.marketCapTon)} TON</p>
        </div>
        <div>
          <p className="text-slate-500">Volume</p>
          <p className="font-bold text-white">{formatTon(launch.volumeTon)} TON</p>
        </div>
      </div>
    </Link>
  );
}
