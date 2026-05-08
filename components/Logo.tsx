import { cn } from "@/lib/utils";

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="TonPad"
      >
        <rect width="56" height="56" rx="14" fill="url(#logo-grad)" />
        <path
          d="M16 18h24l-12 22L16 18z"
          fill="white"
          fillOpacity="0.95"
        />
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop stopColor="#33B5F0" />
            <stop offset="1" stopColor="#0077B5" />
          </linearGradient>
        </defs>
      </svg>
      {withWordmark && (
        <span className="font-display text-lg font-bold tracking-tight">
          <span className="text-ink-900">Ton</span>
          <span className="text-ton-600">Pad</span>
        </span>
      )}
    </div>
  );
}
