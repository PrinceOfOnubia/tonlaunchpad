import Link from "next/link";
import type { ReactNode } from "react";
import { LaunchCard } from "@/components/LaunchCard";
import { launches } from "@/lib/launches";

const steps = ["Create meme", "Bonding curve starts", "Traders buy/sell", "Token graduates later"];
const tape = ["$FLAME +0.0%", "$SIP +0.0%", "$SEND +0.0%", "$WAVE +0.0%", "TON memes, launched instantly."];

export default function Home() {
  const trending = launches.slice(0, 3);
  const latest = [...launches].reverse();

  return (
    <main className="min-h-screen bg-[#050910]">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[64px_1fr]">
        <aside className="hidden border-r border-[#0098ea]/10 bg-[#070c14] md:block">
          <div className="sticky top-0 flex h-screen flex-col items-center justify-between py-5">
            <div className="space-y-5">
              <RailIcon active label="T" />
              <RailIcon label="C" />
              <RailIcon label="S" />
            </div>
            <div className="rounded-md border border-[#0098ea]/15 bg-[#0098ea]/10 px-2 py-3 text-xs font-black text-[#8fd8ff]">
              TON
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <section className="border-b border-[#0098ea]/10 bg-[#070b13]">
            <div className="flex flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-11 w-full max-w-md items-center gap-3 rounded-md border border-[#0098ea]/12 bg-[#0d1422] px-4">
                  <span className="size-3 rounded-full bg-[#0098ea] shadow-[0_0_16px_rgba(0,152,234,0.75)]" />
                  <span className="terminal-label truncate text-slate-500">Search tokens...</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                <div className="col-span-2 rounded-md border border-[#0098ea]/12 bg-[#0d1422] px-3 py-3 sm:px-4">
                  <span className="terminal-label text-slate-500">Tokens </span>
                  <span className="font-black text-white">{launches.length}</span>
                  <span className="mx-3 text-slate-700">|</span>
                  <span className="terminal-label text-slate-500">Balance </span>
                  <span className="font-black text-[#d7f2ff]">1.990 TON</span>
                </div>
                <Link
                  href="/create"
                  className="grid h-11 place-items-center rounded-md bg-[#0098ea] px-4 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[0_0_22px_rgba(0,152,234,0.25)] transition hover:bg-[#19b3ff] sm:px-5 sm:tracking-[0.16em]"
                >
                  Launch
                </Link>
                <button className="h-11 min-w-0 truncate rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm font-black text-emerald-200 sm:px-4">
                  UQC...F61N
                </button>
              </div>
            </div>
            <div className="flex gap-8 overflow-hidden border-t border-[#0098ea]/10 bg-[#0d1422] px-4 py-2 text-sm font-black">
              {tape.map((item) => (
                <span key={item} className="shrink-0 text-slate-200">
                  {item.includes("+") ? (
                    <>
                      {item.split(" ")[0]} <span className="text-emerald-300">{item.split(" ")[1]}</span>
                    </>
                  ) : (
                    item
                  )}
                </span>
              ))}
            </div>
          </section>

          <section className="px-3 py-6 sm:px-4 sm:py-7">
            <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <p className="terminal-label text-[#8fd8ff]">One sip. Up only.</p>
                <h1 className="mt-3 text-4xl font-black leading-[0.98] text-white sm:text-6xl">Launch memes on TON</h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
                  Create a token, start the bonding curve, and let the market sip.
                </p>
              </div>
              <div className="grid gap-3 sm:flex sm:flex-wrap">
                <Link
                  href="/create"
                  className="grid h-11 place-items-center rounded-md bg-[#0098ea] px-5 text-sm font-black uppercase tracking-[0.12em] text-black transition hover:bg-[#19b3ff] sm:tracking-[0.16em]"
                >
                  Launch a Meme
                </Link>
                <a
                  href="#launches"
                  className="grid h-11 place-items-center rounded-md border border-[#0098ea]/20 px-5 text-sm font-black uppercase tracking-[0.12em] text-[#d7f2ff] transition hover:border-[#0098ea]/55 sm:tracking-[0.16em]"
                >
                  Explore Launches
                </a>
              </div>
            </div>

            <div id="launches" className="terminal-panel overflow-hidden rounded-lg">
              <div className="border-b border-[#0098ea]/10 p-4 sm:p-5">
                <p className="terminal-label text-[#8fd8ff]">Top 10 // 24h volume rank</p>
                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  {trending.map((launch, index) => (
                    <div
                      key={launch.id}
                      className="rounded-md border border-[#0098ea]/10 bg-[#121827] p-4 shadow-[inset_3px_0_0_rgba(0,152,234,0.85)]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="terminal-label text-slate-600">
                            #{String(index + 1).padStart(2, "0")} volume rank
                          </p>
                          <h2 className="mt-2 text-lg font-black text-white">{launch.name}</h2>
                          <p className="text-sm font-black text-[#8fd8ff]">${launch.ticker}</p>
                        </div>
                        <span className="font-black text-emerald-300">+0%</span>
                      </div>
                      <div className="mt-6 grid grid-cols-2 border-t border-[#0098ea]/10 pt-4 text-sm">
                        <div>
                          <p className="terminal-label text-slate-600">Market cap</p>
                          <p className="mt-2 font-black text-white">{launch.marketCapTon.toLocaleString()} TON</p>
                        </div>
                        <div className="text-right">
                          <p className="terminal-label text-slate-600">24h volume</p>
                          <p className="mt-2 font-black text-white">{launch.volumeTon.toLocaleString()} TON</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid lg:grid-cols-3">
                <LaunchColumn title="New" count={latest.length} accent="ton" >
                  {latest.map((launch) => (
                    <LaunchCard key={launch.id} launch={launch} compact />
                  ))}
                </LaunchColumn>
                <LaunchColumn title="Almost Bonded" count={0} accent="amber">
                  <EmptyColumn />
                </LaunchColumn>
                <LaunchColumn title="Graduated" count={0} accent="emerald">
                  <EmptyColumn />
                </LaunchColumn>
              </div>
            </div>

            <section className="mt-7 grid gap-3 md:grid-cols-4">
              {steps.map((step, index) => (
                <div key={step} className="terminal-panel rounded-md p-4">
                  <p className="terminal-label text-[#8fd8ff]">0{index + 1}</p>
                  <h3 className="mt-5 text-base font-black text-white">{step}</h3>
                </div>
              ))}
            </section>
          </section>

          <footer className="border-t border-[#0098ea]/10 bg-[#0d1422] px-4 py-8">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div>
                <p className="text-xl font-black tracking-[0.28em] text-[#8fd8ff]">TONIC TERMINAL</p>
                <p className="mt-3 terminal-label text-slate-500">The meme tonic for TON.</p>
              </div>
              <div className="flex flex-wrap gap-5 terminal-label text-slate-400">
                <span>Privacy Policy</span>
                <span>Terms of Service</span>
                <span>Fees</span>
                <span>Docs</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}

function RailIcon({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      className={`grid size-10 place-items-center rounded-md border text-sm font-black ${
        active
          ? "border-[#0098ea]/25 bg-[#0098ea]/12 text-[#8fd8ff] shadow-[inset_3px_0_0_rgba(0,152,234,0.9)]"
          : "border-transparent text-slate-500"
      }`}
    >
      {label}
    </div>
  );
}

function LaunchColumn({
  title,
  count,
  accent,
  children
}: {
  title: string;
  count: number;
  accent: "ton" | "amber" | "emerald";
  children: ReactNode;
}) {
  const dot = {
    ton: "bg-[#0098ea] shadow-[0_0_16px_rgba(0,152,234,0.75)]",
    amber: "bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.6)]",
    emerald: "bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.65)]"
  };

  return (
    <section className="min-h-[420px] border-t border-[#0098ea]/10 lg:border-r lg:border-t-0 lg:border-[#0098ea]/10">
      <div className="flex items-center justify-between border-b border-[#0098ea]/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className={`size-3 rounded-full ${dot[accent]}`} />
          <h2 className="terminal-label text-white">{title}</h2>
        </div>
        <span className="rounded border border-[#0098ea]/10 bg-white/[0.035] px-2 py-1 text-sm font-black text-slate-400">
          {count}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto border-b border-[#0098ea]/10 px-4 py-3 terminal-label text-slate-500">
        <span className="rounded border border-[#0098ea]/15 bg-[#0098ea]/10 px-3 py-2 text-[#8fd8ff]">Fresh</span>
        <span className="px-2 py-2">Volume</span>
        <span className="px-2 py-2">Holders</span>
        <span className="px-2 py-2">Mcap</span>
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}

function EmptyColumn() {
  return <div className="grid min-h-48 place-items-center text-sm font-bold text-slate-600">No tokens in this column</div>;
}
