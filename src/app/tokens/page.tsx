import { LaunchCard } from "@/components/LaunchCard";
import { launches } from "@/lib/launches";

export default function TokensPage() {
  return (
    <main className="min-h-screen bg-[#050910] px-3 py-6 sm:px-5 sm:py-10">
      <section className="tonic-shell">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="terminal-label text-[#8fd8ff]">Launch index</p>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-5xl">Tokens</h1>
          </div>
          <a
            href="/create"
            className="grid h-11 place-items-center rounded-md bg-[#0098ea] px-5 text-sm font-black uppercase tracking-[0.12em] text-black transition hover:bg-[#19b3ff]"
          >
            Launch
          </a>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {launches.map((launch) => (
            <LaunchCard key={launch.id} launch={launch} />
          ))}
        </div>
      </section>
    </main>
  );
}
