import type { Launch } from "@/types/launch";

const toneClass: Record<Launch["imageTone"], string> = {
  flame: "from-[#8fd8ff] via-sky-500 to-blue-950",
  potion: "from-teal-200 via-[#0098ea] to-slate-950",
  spark: "from-white via-[#8fd8ff] to-blue-800",
  wave: "from-sky-200 via-blue-500 to-[#062a45]"
};

export function LaunchOrb({ launch, size = "md" }: { launch: Launch; size?: "sm" | "md" | "lg" }) {
  const dimensions = {
    sm: "size-12",
    md: "size-16",
    lg: "size-24"
  };

  return (
    <div
      className={`${dimensions[size]} grid shrink-0 place-items-center rounded-xl border border-[#0098ea]/20 bg-gradient-to-br ${toneClass[launch.imageTone]} shadow-[0_0_34px_rgba(0,152,234,0.28)]`}
      aria-label={`${launch.name} token image`}
    >
      <span className="text-lg font-black text-white drop-shadow-lg">{launch.ticker.slice(0, 2)}</span>
    </div>
  );
}
