import { useEffect, useMemo, useState } from "react";
import type { PresaleInfo, PresaleStatus } from "./types";

/**
 * Derive the *displayed* presale status from raw data + current time.
 *
 * Closed states (returned as-is) come BEFORE the live-window check:
 *   1. Backend already marked terminal: "succeeded" / "failed" / "finalized" / "canceled"
 *   2. Raised TON has reached the hard cap (contract auto-finalizes via
 *      markSuccessfulEnd() once totalRaised >= hardCap; indexer may take
 *      20-30s to catch up — we mirror it immediately).
 *      Guarded by hardCap > 0 so malformed launches don't auto-close.
 */
export function derivePresaleStatus(presale: PresaleInfo, nowMs = Date.now()): PresaleStatus {
  const rawStatus = String(presale.status);
  if (rawStatus === "canceled" || rawStatus === "cancelled") return "failed";
  if (presale.status === "succeeded") return "succeeded";
  if (presale.status === "failed") return "failed";
  if (presale.status === "finalized") return "finalized";

  const start = new Date(presale.startTime).getTime();
  const end = new Date(presale.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return presale.status;

  if (nowMs < start) return "upcoming";
  if (presale.hardCap > 0 && presale.raised >= presale.hardCap) return "succeeded";
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
