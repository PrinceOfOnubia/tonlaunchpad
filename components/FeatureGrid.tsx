import { CircleDollarSign, Shield, HandCoins, Sparkles, Wallet, BarChart3 } from "lucide-react";

const FEATURES = [
  {
    icon: CircleDollarSign,
    title: "Clear Platform Fees",
    description:
      "Successful sales pay 5% of raised TON to the platform. Failed sales remain refundable.",
    accent: true,
  },
  {
    icon: HandCoins,
    title: "Manual Liquidity",
    description:
      "Creators receive their treasury after success and manage liquidity externally with their own launch plan.",
  },
  {
    icon: Shield,
    title: "Soft / Hard Caps",
    description:
      "Presale enforces a soft cap to refund contributors if it isn't met, and a hard cap to prevent overfunding.",
  },
  {
    icon: Wallet,
    title: "TON Wallet Native",
    description:
      "TonConnect support for Tonkeeper, MyTonWallet, and any compliant TON wallet. One-click contributions.",
  },
  {
    icon: BarChart3,
    title: "Transparent Analytics",
    description:
      "Live presale progress, contributor count, and post-launch price/volume — all backed by on-chain events.",
  },
  {
    icon: Sparkles,
    title: "No-Code Wizard",
    description:
      "Four clear steps. Visual preview as you type. Every parameter is enforced on the smart contract level.",
  },
];

export function FeatureGrid() {
  return (
    <section className="container-page py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-3xl font-bold text-ink-900 sm:text-4xl">
          Built for honest launches
        </h2>
        <p className="mt-3 text-sm text-ink-500 sm:text-base">
          Everything you need to ship a credible token on TON, with mechanics that actually align
          creators and contributors.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className={`glass p-5 ${f.accent ? "ring-1 ring-ton-200" : ""}`}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                f.accent
                  ? "bg-gradient-to-br from-ton-500 to-ton-600 text-white shadow-glow-ton"
                  : "bg-ton-100 text-ton-600"
              }`}
            >
              <f.icon size={18} />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
