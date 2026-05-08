import type { BuybackRate } from "./types";

/**
 * Presets shown in the create-form rate picker.
 * Backend stores the chosen rate verbatim — these are just curated options.
 * "Custom" is handled separately in the UI; users can pick any percent + interval.
 */
export interface BuybackPreset {
  id: string;
  label: string;
  description: string;
  rate: BuybackRate;
}

export const BUYBACK_PRESETS: BuybackPreset[] = [
  {
    id: "drip",
    label: "Drip",
    description: "Slow & steady — minimal price impact",
    rate: { percent: 1, intervalMinutes: 5 },
  },
  {
    id: "steady",
    label: "Steady",
    description: "Balanced cadence",
    rate: { percent: 5, intervalMinutes: 10 },
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Moderate, visible impact",
    rate: { percent: 10, intervalMinutes: 30 },
  },
  {
    id: "aggressive",
    label: "Aggressive",
    description: "Larger chunks, hourly",
    rate: { percent: 15, intervalMinutes: 60 },
  },
  {
    id: "burst",
    label: "Burst",
    description: "Big buys, fewer per day",
    rate: { percent: 25, intervalMinutes: 240 },
  },
];

export const DEFAULT_BUYBACK_PRESET_ID = "steady";

/**
 * How long the buyback budget will last given a rate. Returned in minutes.
 * Pure UI helper — doesn't touch the backend.
 */
export function buybackBudgetDurationMinutes(rate: BuybackRate): number {
  if (rate.percent <= 0) return Infinity;
  return Math.ceil((100 / rate.percent) * rate.intervalMinutes);
}

export function formatBuybackRate(rate: BuybackRate): string {
  return `${rate.percent}% every ${formatInterval(rate.intervalMinutes)}`;
}

export function formatInterval(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(min / (60 * 24));
  const h = Math.floor((min % (60 * 24)) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

export function findPresetByRate(rate: BuybackRate): BuybackPreset | undefined {
  return BUYBACK_PRESETS.find(
    (p) => p.rate.percent === rate.percent && p.rate.intervalMinutes === rate.intervalMinutes,
  );
}
