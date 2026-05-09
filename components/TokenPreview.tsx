"use client";

import { AtSign, Globe, Send, Youtube, Github, Music2 } from "lucide-react";
import type { CreateTokenPayload } from "@/lib/types";
import { cn, formatTon } from "@/lib/utils";

interface Props {
  data: CreateTokenPayload;
  imagePreview: string | null;
  bannerPreview?: string | null;
}

export function TokenPreview({ data, imagePreview, bannerPreview }: Props) {
  const symbol = data.symbol || "TKN";
  const name = data.name || "Your Token";
  const initials = symbol.slice(0, 2).toUpperCase();

  const socials = data.social;
  const hasSocial =
    !!(socials.website || socials.twitter || socials.telegram || socials.youtube || socials.tiktok || socials.github);

  return (
    <div className="sticky top-24 space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        Live Preview
      </div>

      <div className="glass overflow-hidden">
        {/* Banner strip — uploaded preview or subtle gradient fallback */}
        {bannerPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerPreview} alt="" className="h-24 w-full object-cover" />
        ) : (
          <div className="h-24 w-full bg-gradient-to-br from-ton-100 via-ton-50 to-white" />
        )}

        <div className="p-5">
          <div className="flex items-start gap-3">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="preview"
                className="h-14 w-14 rounded-full object-cover ring-2 ring-white"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ton-gradient font-display text-base font-bold text-white ring-2 ring-white">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-display text-lg font-semibold text-ink-900">{name}</h3>
              <span className="rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink-600">
                {symbol}
              </span>
            </div>
          </div>

          {data.description && (
            <p className="mt-3 line-clamp-3 text-xs text-ink-600">{data.description}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-ton-50 px-2 py-0.5 text-[11px] font-medium text-ton-700 ring-1 ring-inset ring-ton-200">
              Manual liquidity after presale
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3 text-xs">
            <Stat label="Soft cap" value={formatTon(data.presale.softCap || 0)} />
            <Stat label="Hard cap" value={formatTon(data.presale.hardCap || 0)} />
            <Stat label="Rate" value={`${data.presale.rate || 0} / TON`} />
            <Stat label="Liquidity" value={`${data.liquidityPercent}%`} />
          </div>

          {hasSocial && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3 text-ink-400">
              {socials.website && <Globe size={14} />}
              {socials.twitter && <AtSign size={14} />}
              {socials.telegram && <Send size={14} />}
              {socials.youtube && <Youtube size={14} />}
              {socials.tiktok && <Music2 size={14} />}
              {socials.github && <Github size={14} />}
            </div>
          )}
        </div>
      </div>

      <AllocationDonut data={data.allocations} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-ink-500">{label}</div>
      <div className="font-mono font-semibold text-ink-900">{value}</div>
    </div>
  );
}

function AllocationDonut({ data }: { data: { presale: number; liquidity: number; creator: number } }) {
  const total = data.presale + data.liquidity + data.creator;
  const safe = total > 0 ? data : { presale: 1, liquidity: 1, creator: 1 };
  const sum = safe.presale + safe.liquidity + safe.creator;

  const segments = [
    { value: safe.presale, color: "#0098EA", label: "Presale" },
    { value: safe.liquidity, color: "#7CC4F5", label: "Liquidity" },
    { value: safe.creator, color: "#0077B5", label: "Creator" },
  ];

  let acc = 0;
  const c = 50;
  const r = 38;

  return (
    <div className="glass flex items-center gap-4 p-5">
      <svg viewBox="0 0 100 100" className="h-24 w-24">
        {segments.map((seg) => {
          const frac = seg.value / sum;
          const start = (acc / sum) * 2 * Math.PI;
          const end = ((acc + seg.value) / sum) * 2 * Math.PI;
          acc += seg.value;
          const x1 = c + r * Math.sin(start);
          const y1 = c - r * Math.cos(start);
          const x2 = c + r * Math.sin(end);
          const y2 = c - r * Math.cos(end);
          const large = frac > 0.5 ? 1 : 0;
          return (
            <path
              key={seg.label}
              d={`M ${c} ${c} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
              fill={seg.color}
            />
          );
        })}
        <circle cx={c} cy={c} r={22} fill="white" />
      </svg>
      <div className="flex-1 space-y-1.5 text-xs">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className={cn("inline-block h-2 w-2 rounded-full")}
                style={{ background: s.color }}
              />
              <span className="text-ink-600">{s.label}</span>
            </div>
            <span className="font-mono font-semibold text-ink-900">{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
