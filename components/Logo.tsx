import { cn } from "@/lib/utils";

/**
 * Site logo. Renders the brand mark from /public/logo.png and an optional
 * wordmark. The component's external API (className, withWordmark) is
 * unchanged — all existing usages keep working.
 */
export function Logo({
  className,
  withWordmark = true,
}: {
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="TonPad"
        width={30}
        height={30}
        className="h-[30px] w-[30px] rounded-full"
      />
      {withWordmark && (
        <span className="font-display text-lg font-bold tracking-tight">
          <span className="text-ink-900">Ton</span>
          <span className="text-ton-500">Pad</span>
        </span>
      )}
    </div>
  );
}
