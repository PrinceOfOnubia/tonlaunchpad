import { cn } from "@/lib/utils";

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width="30"
        height="30"
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="TonPad"
      >
        <circle cx="28" cy="28" r="28" fill="url(#logo-grad)" />
        <path
          d="M17 19h22L28 39 17 19z"
          fill="white"
          fillOpacity="0.96"
        />
        <defs>
          <linearGradient
            id="logo-grad"
            x1="8"
            y1="8"
            x2="48"
            y2="48"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#33B5F0" />
            <stop offset="1" stopColor="#0079BB" />
          </linearGradient>
        </defs>
      </svg>
      {withWordmark && (
        <span className="font-display text-lg font-bold tracking-tight">
          <span className="text-ink-900">Ton</span>
          <span className="text-ton-500">Pad</span>
        </span>
      )}
    </div>
  );
}
