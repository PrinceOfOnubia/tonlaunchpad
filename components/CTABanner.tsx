import Link from "next/link";
import { Rocket } from "lucide-react";

export function CTABanner() {
  return (
    <section className="container-page pb-20">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ton-600 via-ton-500 to-ton-700 px-8 py-12 text-center text-white sm:px-12 sm:py-16">
        {/* Decorative grid */}
        <div className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 h-64 w-64 rounded-full bg-white/10 blur-3xl" />

        <div className="relative">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Ready to launch?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/85 sm:text-base">
            Configure your tokenomics, presale, and buyback cadence in five guided steps. No code,
            no waiting.
          </p>
          <div className="mt-7 flex justify-center">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-ton-700 shadow-lg transition-transform hover:scale-[1.02]"
            >
              <Rocket size={18} />
              Launch your token
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
