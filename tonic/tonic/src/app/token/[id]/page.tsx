import { notFound } from "next/navigation";
import { BondingCurvePanel } from "@/components/BondingCurvePanel";
import { ContractCopyButton } from "@/components/ContractCopyButton";
import { LaunchOrb } from "@/components/LaunchOrb";
import { ProgressBar } from "@/components/ProgressBar";
import { formatTon, getLaunch, launches, recentTrades } from "@/lib/launches";

type TokenPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export function generateStaticParams() {
  return launches.map((launch) => ({ id: launch.id }));
}

export default async function TokenPage({ params }: TokenPageProps) {
  const { id } = await params;
  const launch = getLaunch(id);

  if (!launch) {
    notFound();
  }

  return (
    <main className="tonic-shell py-5 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-lg border border-[#0098ea]/12 bg-white/[0.035] p-4 sm:p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <LaunchOrb launch={launch} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="terminal-label text-[#8fd8ff]">Token detail</p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-white sm:text-4xl">
                {launch.name} <span className="text-[#8fd8ff]">${launch.ticker}</span>
              </h1>
              <p className="mt-3 max-w-2xl text-slate-300">{launch.description}</p>
            </div>
            <ContractCopyButton contract={launch.contract} />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Stat label="Market cap" value={`${formatTon(launch.marketCapTon)} TON`} />
            <Stat label="Price" value={`${formatTon(launch.priceTon)} TON`} />
            <Stat label="Holders" value={launch.holders.toLocaleString()} />
          </div>

          <div className="mt-8 rounded-lg border border-[#0098ea]/10 bg-black/45 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-white">Bonding curve progress</h2>
                <p className="mt-1 text-sm text-slate-400">Graduation unlocks later.</p>
              </div>
              <span className="text-2xl font-black text-[#8fd8ff]">{launch.progress}%</span>
            </div>
            <div className="mt-5">
              <ProgressBar value={launch.progress} />
            </div>
          </div>

          <section className="mt-8">
            <h2 className="text-xl font-black text-white">Recent trades</h2>
            <div className="mt-4 overflow-x-auto rounded-lg border border-[#0098ea]/10">
              <div className="min-w-[520px]">
                {recentTrades.map((trade) => (
                  <div
                    key={trade.id}
                    className="grid grid-cols-4 gap-3 border-b border-[#0098ea]/10 bg-black/35 px-4 py-3 text-sm last:border-b-0"
                  >
                    <span className={trade.side === "buy" ? "font-bold text-[#8fd8ff]" : "font-bold text-slate-400"}>
                      {trade.side.toUpperCase()}
                    </span>
                    <span className="text-white">{trade.amountTon} TON</span>
                    <span className="text-slate-300">{trade.tokens.toLocaleString()}</span>
                    <span className="text-right text-slate-500">{trade.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </section>

        <BondingCurvePanel priceTon={launch.priceTon} />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#0098ea]/10 bg-black/45 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  );
}
