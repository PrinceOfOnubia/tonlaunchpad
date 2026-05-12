import Link from "next/link";
import { ArrowRight, Rocket, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="container-page pt-12 pb-16 sm:pt-20 sm:pb-20 text-center">
        <div className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-ton-100 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-ton-700 shadow-sm backdrop-blur-sm">
          <Sparkles size={12} className="text-ton-500" />
          Live on TON Testnet
        </div>

        {/* Title */}
        <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl lg:text-[5.25rem]">
          Fair and transparent <span className="text-ton-500">TON</span>
          <br className="hidden sm:block" />
          <span className="block sm:inline"> presales.</span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-500 sm:text-lg">
          Create a token, run a capped presale, let contributors claim after success, and handle
          liquidity manually with a simpler on-chain flow. Born from the $PLANKTON ecosystem.
        </p>

        {/* CTAs */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-ton-500 to-ton-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-ton-500/30 transition-all hover:shadow-glow-ton hover:-translate-y-0.5"
          >
            <Rocket size={16} />
            Launch Token
            <ArrowRight size={14} />
          </Link>
          <Link
            href="/tokens"
            className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 bg-white px-6 py-3 text-sm font-semibold text-ink-700 shadow-sm transition-colors hover:bg-ink-50"
          >
            Explore Tokens
          </Link>
        </div>

        {/* Trust signals */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink-500">
          <TrustSignal color="bg-emerald-500" label="Audited contracts" />
          <TrustSignal color="bg-ton-500" label="Manual liquidity" />
          <TrustSignal color="bg-amber-500" label="Clear platform fees" />
        </div>
      </div>
    </section>
  );
}

function TrustSignal({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
