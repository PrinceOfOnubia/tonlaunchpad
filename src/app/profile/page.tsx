import { TonConnectButtonPlaceholder } from "@/components/TonConnectButtonPlaceholder";

const rows = [
  ["Created launches", "0"],
  ["Contributed", "0 TON"],
  ["Claimable", "0 tokens"],
  ["Refundable", "0 TON"]
];

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-[#050910] px-3 py-6 sm:px-5 sm:py-10">
      <section className="tonic-shell">
        <div className="terminal-panel rounded-lg p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="terminal-label text-[#8fd8ff]">Wallet profile</p>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">Portfolio</h1>
            </div>
            <TonConnectButtonPlaceholder />
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#0098ea]/10 bg-black/35 p-4">
                <p className="terminal-label text-slate-500">{label}</p>
                <p className="mt-3 text-2xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
