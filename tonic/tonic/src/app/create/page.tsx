const tabs = ["01 Mode", "02 Details", "03 Preview", "04 Launch"];

export default function CreatePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050910] px-3 py-5 sm:py-8">
      <div className="grid-glow absolute inset-0 opacity-30" />
      <div className="absolute inset-x-0 top-24 mx-auto h-80 max-w-4xl rounded-full bg-[#0098ea]/10 blur-3xl" />

      <section className="terminal-panel relative mx-auto max-w-4xl overflow-hidden rounded-lg shadow-[0_0_90px_rgba(0,152,234,0.16)]">
        <header className="flex items-center justify-between border-b border-[#0098ea]/10 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-center gap-3">
            <span className="blue-flame grid size-7 place-items-center rounded-md border border-[#0098ea]/20">
              <span className="size-2 rounded-full bg-[#d7f2ff]" />
            </span>
            <h1 className="terminal-label text-[#8fd8ff]">Create Token</h1>
          </div>
          <a
            href="/"
            className="grid size-9 place-items-center rounded-md border border-[#0098ea]/12 bg-white/[0.03] text-sm font-black text-slate-400 transition hover:text-white"
          >
            X
          </a>
        </header>

        <div className="h-px bg-[#0098ea]" />

        <form className="p-4 sm:p-7">
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[#0098ea]/10 bg-[#101725] md:grid-cols-4">
            {tabs.map((tab, index) => (
              <div
                key={tab}
                className={`border-b border-r border-[#0098ea]/10 px-3 py-4 text-center terminal-label md:border-b-0 md:px-4 ${
                  index === 1 ? "bg-[#0098ea] text-black" : index === 0 ? "bg-[#0098ea]/10 text-[#8fd8ff]" : "text-slate-600"
                }`}
              >
                {tab}
              </div>
            ))}
          </div>

          <div className="mt-7 rounded-md border border-[#0098ea]/10 bg-[#080d15] p-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Graduation" value="100K TON" />
              <Metric label="Max Wallet" value="1%" />
              <Metric label="Buy Fee" value="1%" />
              <Metric label="Sell" value="Curve" />
            </div>
          </div>

          <SectionTitle title="Identity" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Token name *" placeholder="Blue Tonic Inu" />
            <Field label="Ticker *" placeholder="BTINU" />
            <label className="block md:col-span-2">
              <span className="terminal-label text-slate-400">Description</span>
              <textarea
                className="mt-2 min-h-28 w-full resize-none rounded-md border border-[#0098ea]/10 bg-[#060b12] px-4 py-3 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[#0098ea]/55"
                placeholder="Tell your story..."
              />
            </label>
          </div>

          <SectionTitle title="Media" />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="terminal-label text-slate-400">Token image</span>
              <div className="mt-2 flex min-h-20 items-center gap-4 rounded-md border border-dashed border-[#0098ea]/25 bg-[#060b12] px-4 py-4">
                <span className="grid size-10 place-items-center rounded-md bg-[#0098ea]/10 text-xl font-black text-[#8fd8ff]">+</span>
                <div>
                  <p className="text-sm font-bold text-slate-300">Upload from device</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">PNG/JPG/GIF max 10MB</p>
                </div>
              </div>
            </label>
            <Field label="Website" placeholder="https://..." />
          </div>

          <SectionTitle title="Socials" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Twitter" placeholder="@handle" />
            <Field label="Telegram" placeholder="t.me/..." />
          </div>

          <SectionTitle title="Curve" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Total supply" placeholder="1,000,000,000" />
            <Field label="Initial creator buy amount in TON" placeholder="10" />
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#0098ea]/10 pt-5 sm:flex-row sm:justify-end">
            <a
              href="/"
              className="grid h-11 place-items-center rounded-md border border-[#0098ea]/12 px-6 text-sm font-black uppercase tracking-[0.12em] text-slate-400 transition hover:text-white sm:tracking-[0.16em]"
            >
              Back
            </a>
            <button
              type="button"
              className="h-11 rounded-md bg-[#0098ea] px-6 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[0_0_24px_rgba(0,152,234,0.28)] transition hover:bg-[#19b3ff] sm:px-7 sm:tracking-[0.16em]"
            >
              Launch on Tonic
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <h2 className="terminal-label text-[#8fd8ff]">{title}</h2>
      <div className="h-px flex-1 bg-[#0098ea]/10" />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm md:block">
      <p className="font-bold text-slate-500">{label}</p>
      <p className="font-black text-slate-100 md:mt-2">{value}</p>
    </div>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="terminal-label text-slate-400">{label}</span>
      <input
        className="mt-2 h-12 w-full rounded-md border border-[#0098ea]/10 bg-[#060b12] px-4 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[#0098ea]/55"
        placeholder={placeholder}
      />
    </label>
  );
}
