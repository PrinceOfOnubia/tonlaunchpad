import Link from "next/link";
import { ArrowRight, Repeat2, Shield, Zap } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Decorative blurs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-ton-300/30 blur-3xl" />
        <div className="absolute -right-24 top-32 h-96 w-96 rounded-full bg-ton-500/20 blur-3xl" />
      </div>

      <div className="container-page pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-ton-200 bg-white/80 px-3 py-1 text-xs font-semibold text-ton-700 shadow-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ton-500 animate-pulse" />
          Programmatic buybacks · Live on TON
        </div>

        <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-ink-900 sm:text-6xl lg:text-7xl">
          Launch tokens on{" "}
          <span className="bg-gradient-to-r from-ton-500 to-ton-700 bg-clip-text text-transparent">
            TON
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-500 sm:text-lg">
          Fair presales, locked liquidity, and automatic buybacks of up to 40% — all configurable
          in a single flow.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/create" className="btn-primary">
            Launch your token <ArrowRight size={16} />
          </Link>
          <Link href="/tokens" className="btn-ghost">
            Explore tokens
          </Link>
        </div>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
          <Pill icon={Repeat2} label="0–40% buybacks" desc="Choose your cadence" />
          <Pill icon={Shield} label="Locked liquidity" desc="Anti-rug by default" />
          <Pill icon={Zap} label="Deploy in minutes" desc="No code, no friction" />
        </div>
      </div>
    </section>
  );
}

function Pill({
  icon: Icon,
  label,
  desc,
}: {
  icon: typeof Repeat2;
  label: string;
  desc: string;
}) {
  return (
    <div className="glass flex items-center gap-3 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ton-100 text-ton-600">
        <Icon size={16} />
      </div>
      <div>
        <div className="text-sm font-semibold text-ink-900">{label}</div>
        <div className="text-xs text-ink-500">{desc}</div>
      </div>
    </div>
  );
}
