import { useEffect, useMemo, useState } from "react";
import type { PresaleInfo, PresaleStatus } from "./types";

export function derivePresaleStatus(presale: PresaleInfo, nowMs = Date.now()): PresaleStatus {
  if (presale.status === "succeeded") return "succeeded";
  if (presale.status === "failed") return "failed";
  if (presale.status === "finalized") return "finalized";

  const start = new Date(presale.startTime).getTime();
  const end = new Date(presale.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return presale.status;

  if (nowMs < start) return "upcoming";
  if (nowMs <= end) return "live";
  return presale.raised >= presale.softCap ? "succeeded" : "failed";
}

export function useEffectivePresale(presale: PresaleInfo, intervalMs = 1_000): PresaleInfo {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = globalThis.setInterval(() => setNow(Date.now()), intervalMs);
    return () => globalThis.clearInterval(id);
  }, [intervalMs]);

  return useMemo(
    () => ({ ...presale, status: derivePresaleStatus(presale, now) }),
    [now, presale],
  );
}

export function hardCapRemaining(presale: PresaleInfo): number {
  return Math.max(0, presale.hardCap - presale.raised);
}
