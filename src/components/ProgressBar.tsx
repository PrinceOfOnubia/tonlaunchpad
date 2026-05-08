export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full border border-[#0098ea]/20 bg-slate-950">
      <div
        className="h-full rounded-full bg-gradient-to-r from-sky-500 via-[#8fd8ff] to-blue-500 shadow-[0_0_18px_rgba(0,152,234,0.55)]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
