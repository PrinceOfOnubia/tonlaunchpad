"use client";

import { useState, useMemo, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Rocket,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  cn,
  clamp,
  formatTon,
  fromDatetimeLocal,
  toDatetimeLocal,
} from "@/lib/utils";
import type { CreateTokenPayload } from "@/lib/types";
import {
  buildLaunchTokenTransaction,
  DEFAULT_TOKEN_IMAGE_URL,
  getLaunchValidationError,
  normalizeTonConnectError,
} from "@/lib/tonLaunchpad";
import { tonviewerAddressUrl } from "@/lib/explorer";
import { saveRecentLaunch, tokenFromLaunchInput } from "@/lib/recentLaunches";
import { TokenPreview } from "./TokenPreview";

type Step = 0 | 1 | 2 | 3;
const STEPS: { title: string; subtitle: string }[] = [
  { title: "Token", subtitle: "Identity & branding" },
  { title: "Allocation", subtitle: "Token distribution" },
  { title: "Presale", subtitle: "Caps, schedule, pricing" },
  { title: "Review", subtitle: "Confirm & deploy" },
];

/**
 * Total supply is fixed by the platform — every launched token gets exactly
 * 1B units. Set here as a single source of truth; the form treats this as
 * read-only.
 */
const FIXED_TOTAL_SUPPLY = 1_000_000_000;

const initialPayload = (): CreateTokenPayload => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7d
  return {
    name: "",
    symbol: "",
    description: "",
    imageUrl: null,
    totalSupply: FIXED_TOTAL_SUPPLY,
    decimals: 9,
    allocations: { presale: 50, liquidity: 30, creator: 20 },
    presale: {
      rate: 1000,
      softCap: 100,
      hardCap: 500,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      minContribution: 0.5,
      maxContribution: 50,
    },
    liquidityPercent: 70,
    social: {},
    creator: "",
  };
};

// =============================================================================
// Pricing engine (auto-derived — never user-typed)
// =============================================================================
interface PricingBreakdown {
  /** Tokens issued per 1 TON contributed in presale */
  rate: number;
  /** Total tokens that will be sold during presale */
  presaleTokens: number;
  /** TON paid per 1 token in presale */
  presalePriceTon: number;
  /** TON from raise that ends up in the DEX pool */
  liquidityTon: number;
  /** Tokens from supply that end up in the DEX pool */
  listingTokens: number;
  /** TON per 1 token at listing (initial DEX price) */
  listingPriceTon: number;
  /** Fully-diluted valuation in TON at listing */
  marketCapTon: number;
  /** Discount presale buyers receive vs listing price (%) */
  discountPct: number;
  /** Set when presale price > listing price (anti-pattern) */
  warning: string | null;
  /** Whether all required inputs are present and the math is computable */
  ok: boolean;
}

function computePricing(d: CreateTokenPayload): PricingBreakdown {
  const presaleTokens = d.totalSupply * (d.allocations.presale / 100);
  const liquidityTon = d.presale.hardCap * (d.liquidityPercent / 100);
  const listingTokens = d.totalSupply * (d.allocations.liquidity / 100);

  const ok =
    d.totalSupply > 0 &&
    presaleTokens > 0 &&
    d.presale.hardCap > 0 &&
    listingTokens > 0;

  if (!ok) {
    return {
      rate: 0,
      presaleTokens,
      presalePriceTon: 0,
      liquidityTon,
      listingTokens,
      listingPriceTon: 0,
      marketCapTon: 0,
      discountPct: 0,
      warning: null,
      ok: false,
    };
  }

  const rate = presaleTokens / d.presale.hardCap;
  const presalePriceTon = d.presale.hardCap / presaleTokens;
  const listingPriceTon = liquidityTon / listingTokens;
  const marketCapTon = listingPriceTon * d.totalSupply;
  const discountPct =
    listingPriceTon > 0
      ? ((listingPriceTon - presalePriceTon) / listingPriceTon) * 100
      : 0;

  return {
    rate,
    presaleTokens,
    presalePriceTon,
    liquidityTon,
    listingTokens,
    listingPriceTon,
    marketCapTon,
    discountPct,
    warning: null,
    ok: true,
  };
}

function formatPriceTon(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "—";
  if (p < 0.000001) return `${p.toExponential(2)} TON`;
  if (p < 0.01) return `${trimZeros(p.toFixed(8))} TON`;
  if (p < 1) return `${trimZeros(p.toFixed(6))} TON`;
  return `${trimZeros(p.toFixed(4))} TON`;
}

function formatRate(r: number): string {
  if (!Number.isFinite(r) || r <= 0) return "—";
  if (r >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(r);
  }
  if (r >= 1) return trimZeros(r.toFixed(2));
  return trimZeros(r.toFixed(6));
}

function trimZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

// =============================================================================
// Allocation auto-balancer
// Whenever one slider changes, the other two are re-distributed so the total
// always sums to exactly 100. The other two keep their relative ratio when
// possible; if both were at 0, the remainder is split evenly.
// =============================================================================
type AllocKey = "presale" | "liquidity" | "creator";

function rebalanceAllocations(
  current: { presale: number; liquidity: number; creator: number },
  changed: AllocKey,
  newValue: number,
): { presale: number; liquidity: number; creator: number } {
  const v = clamp(Math.round(newValue), 0, 100);
  const remaining = 100 - v;
  const others: AllocKey[] = (["presale", "liquidity", "creator"] as AllocKey[]).filter(
    (k) => k !== changed,
  );
  const [a, b] = others;
  const aOld = current[a];
  const bOld = current[b];
  const otherSum = aOld + bOld;

  let aNew: number;
  let bNew: number;
  if (otherSum <= 0) {
    aNew = Math.floor(remaining / 2);
    bNew = remaining - aNew;
  } else {
    aNew = Math.round((aOld / otherSum) * remaining);
    bNew = remaining - aNew; // guarantees exact 100 total
  }

  return {
    ...current,
    [changed]: v,
    [a]: aNew,
    [b]: bNew,
  } as { presale: number; liquidity: number; creator: number };
}

// =============================================================================
// PricingBreakdown — visible calculator panel rendered inside Step 3
// =============================================================================
function PricingBreakdown({
  pricing,
  symbol,
}: {
  pricing: PricingBreakdown;
  symbol: string;
}) {
  const sym = symbol.trim() || "TKN";
  return (
    <div className="rounded-xl border border-ton-100 bg-ton-50/40 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ton-700">
            Pricing breakdown
          </div>
          <div className="text-[11px] text-ink-500">
            Calculated automatically from total supply, allocation, hard cap, and
            liquidity %.
          </div>
        </div>
        {pricing.ok && pricing.discountPct > 0 && (
          <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            Presale −{pricing.discountPct.toFixed(1)}% vs listing
          </div>
        )}
      </div>

      {!pricing.ok ? (
        <div className="text-sm text-ink-500">
          Fill in total supply, allocation, hard cap, and liquidity % to see
          pricing.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <PricingRow
            label="Presale price"
            value={`${formatPriceTon(pricing.presalePriceTon)} / ${sym}`}
          />
          <PricingRow
            label="Listing price"
            value={`${formatPriceTon(pricing.listingPriceTon)} / ${sym}`}
          />
          <PricingRow
            label="Tokens per 1 TON"
            value={formatRate(pricing.rate)}
          />
          <PricingRow
            label="FDV at listing"
            value={formatTon(pricing.marketCapTon)}
          />
        </div>
      )}
    </div>
  );
}

function PricingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-ink-100">
      <span className="text-xs text-ink-500">{label}</span>
      <span className="font-mono text-sm font-semibold text-ink-900">
        {value}
      </span>
    </div>
  );
}

export function CreateTokenForm() {
  const wallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const router = useRouter();

  const [step, setStep] = useState<Step>(0);
  const [data, setData] = useState<CreateTokenPayload>(initialPayload);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metadataNotice, setMetadataNotice] = useState<string | null>(null);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Validation per step
  // ---------------------------------------------------------------------
  const validation = useMemo(() => validate(data), [data]);
  const pricing = useMemo(() => computePricing(data), [data]);
  const allocSum =
    data.allocations.presale + data.allocations.liquidity + data.allocations.creator;

  function update<K extends keyof CreateTokenPayload>(k: K, v: CreateTokenPayload[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  function patch<K extends keyof CreateTokenPayload>(k: K, partial: Partial<CreateTokenPayload[K]>) {
    setData((d) => ({ ...d, [k]: { ...(d[k] as object), ...partial } as CreateTokenPayload[K] }));
  }

  function handleImage(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("Image must be ≤ 5MB");
      return;
    }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
    setMetadataNotice("Logo will be uploaded and included in hosted token metadata.");
  }

  function handleBanner(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setError("Banner must be ≤ 8MB");
      return;
    }
    setBannerFile(f);
    setBannerPreview(URL.createObjectURL(f));
  }

  // ---------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------
  async function handleDeploy() {
    setError(null);
    setDeployStatus(null);
    setExplorerUrl(null);

    const formError = firstValidationError(validation);
    if (formError) {
      setError(formError);
      return;
    }

    if (!wallet) {
      setDeployStatus("Opening wallet connection...");
      try {
        tonConnectUI.openModal();
      } catch (err) {
        console.error("Failed to open TonConnect modal", err);
        setError("Please connect your wallet first.");
      } finally {
        setDeployStatus(null);
      }
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = data.imageUrl || DEFAULT_TOKEN_IMAGE_URL;
      let bannerUrl: string | null = data.bannerUrl ?? null;
      let metadataUrl: string | null = null;
      if (imageFile && !data.imageUrl) {
        setDeployStatus("Uploading token logo...");
        try {
          const uploaded = await api.upload.image(imageFile);
          imageUrl = uploaded.url;
          setMetadataNotice("Logo uploaded and included in token metadata.");
        } catch (err) {
          console.warn("Logo upload failed; using default token image.", err);
          setMetadataNotice("Logo upload failed. Using the default token image for this launch.");
          imageUrl = DEFAULT_TOKEN_IMAGE_URL;
        }
      }
      if (bannerFile && !data.bannerUrl) {
        setDeployStatus("Uploading banner...");
        try {
          const uploaded = await api.upload.image(bannerFile);
          bannerUrl = uploaded.url;
        } catch (err) {
          console.warn("Banner upload failed; banner will be omitted.", err);
          bannerUrl = null;
        }
      }
      setDeployStatus("Publishing token metadata...");
      try {
        const metadata = await api.metadata.create({
          name: data.name,
          symbol: data.symbol,
          description: data.description,
          decimals: data.decimals,
          imageUrl,
        });
        metadataUrl = metadata.url;
      } catch (err) {
        console.warn("Metadata hosting unavailable; falling back to embedded metadata URL.", err);
        metadataUrl = null;
      }
      const payload: CreateTokenPayload = {
        ...data,
        presale: { ...data.presale, rate: pricing.rate },
        imageUrl,
        bannerUrl,
        metadataUrl,
        creator: wallet,
      };

      const launchError = getLaunchValidationError(payload);
      if (launchError) {
        setError(launchError);
        setDeployStatus(null);
        return;
      }

      setDeployStatus("Waiting for wallet approval...");
      const transaction = buildLaunchTokenTransaction(payload, wallet);
      const result = await tonConnectUI.sendTransaction({
        validUntil: transaction.validUntil,
        messages: [
          {
            address: transaction.to,
            amount: transaction.amountNano,
            payload: transaction.payload,
          },
        ],
      });

      console.debug("Launch transaction result BOC", result.boc);
      let launchId = `recent-${Date.now().toString(36)}`;
      const createdAt = new Date().toISOString();
      const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
      let token = tokenFromLaunchInput({
        id: launchId,
        form: payload,
        factoryAddress,
        createdAt,
      });
      saveRecentLaunch({
        id: launchId,
        name: token.name,
        symbol: token.symbol,
        transactionBoc: result.boc,
        factoryAddress,
        creator: wallet,
        createdAt,
        poolAddress: null,
        tokenAddress: null,
        token,
      });
      setDeployStatus("Preparing launch dashboard...");
      try {
        const savedToken = await api.tokens.create({
          ...payload,
          transactionBoc: result.boc,
          factoryAddress,
          tokenMasterAddress: null,
          presalePoolAddress: null,
        });
        launchId = savedToken.id;
        token = savedToken;
        saveRecentLaunch({
          id: launchId,
          name: token.name,
          symbol: token.symbol,
          transactionBoc: result.boc,
          factoryAddress,
          creator: wallet,
          createdAt,
          poolAddress: token.presalePoolAddress ?? null,
          tokenAddress: token.address ?? null,
          token,
        });
      } catch (err) {
        console.warn("Launch dashboard save unavailable. Launch kept in local fallback cache.", err);
        setMetadataNotice("Launch saved locally. Your dashboard will update when the service is reachable.");
      }

      setExplorerUrl(tonviewerAddressUrl(factoryAddress ?? wallet));
      setDeployedId(launchId);
      setDeployStatus("Launch transaction submitted.");
    } catch (err) {
      console.error("Launch deployment failed", err);
      setError(normalizeTonConnectError(err));
      setDeployStatus(null);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------
  if (deployedId) {
    return (
      <div className="glass mx-auto max-w-xl p-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold text-ink-900">Launch submitted!</h2>
        <p className="mt-2 text-sm text-ink-500">
          Launch submitted successfully. Your presale page is now available.
        </p>
        {data.name && (
          <div className="mt-4 rounded-lg bg-ink-50 p-3">
            <div className="text-sm font-semibold text-ink-900">
              {data.name} <span className="font-mono text-ink-500">{data.symbol}</span>
            </div>
            <div className="mt-1 text-xs font-medium text-emerald-600">Presale page ready</div>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={() => router.push(`/token/${deployedId}`)}
            className="btn-primary"
          >
            View Presale
          </button>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-ghost"
            >
              View transaction
            </a>
          )}
          <button onClick={() => router.push("/tokens")} className="btn-ghost">
            Browse all tokens
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Wizard
  // ---------------------------------------------------------------------
  const stepValid = validation.bySteps[step];
  const isLast = step === 3;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <Stepper step={step} />

        <div className="glass p-6 sm:p-8">
          {step === 0 && (
            <StepIdentity
              data={data}
              update={update}
              patch={patch}
              imagePreview={imagePreview}
              onImage={handleImage}
              bannerPreview={bannerPreview}
              onBanner={handleBanner}
            />
          )}
          {step === 1 && <StepAllocation data={data} patch={patch} sum={allocSum} />}
          {step === 2 && <StepPresale data={data} update={update} patch={patch} pricing={pricing} />}
          {step === 3 && <StepReview data={data} imagePreview={imagePreview} pricing={pricing} />}

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {metadataNotice && (
            <div className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-amber-200">
              {metadataNotice}
            </div>
          )}

          {deployStatus && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-ton-50 p-3 text-sm text-ton-700 ring-1 ring-ton-200">
              <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
              <span>{deployStatus}</span>
            </div>
          )}

          {!validation.bySteps[step].ok && (
            <div className="mt-5 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 ring-1 ring-amber-200">
              {validation.bySteps[step].reason}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-5">
            <button
              type="button"
              onClick={() => setStep((s) => (s > 0 ? ((s - 1) as Step) : s))}
              disabled={step === 0 || submitting}
              className="btn-ghost"
            >
              <ArrowLeft size={16} /> Back
            </button>

            {!isLast ? (
              <button
                type="button"
                onClick={() => stepValid.ok && setStep((s) => ((s + 1) as Step))}
                disabled={!stepValid.ok}
                className="btn-primary"
              >
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDeploy}
                disabled={!validation.allValid || submitting}
                className="btn-primary"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Deploying…
                  </>
                ) : !wallet ? (
                  <>
                    <Wallet size={16} /> Connect wallet to deploy
                  </>
                ) : (
                  <>
                    <Rocket size={16} /> Deploy Token
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <TokenPreview data={data} imagePreview={imagePreview} bannerPreview={bannerPreview} />
      </div>
    </div>
  );
}

// =============================================================================
// Stepper
// =============================================================================
function Stepper({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {STEPS.map((s, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={s.title} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                done && "bg-ton-600 text-white",
                active && "bg-ton-600 text-white ring-4 ring-ton-100",
                !done && !active && "bg-ink-100 text-ink-500",
              )}
            >
              {done ? <CheckCircle2 size={16} /> : i + 1}
            </div>
            <div className="hidden whitespace-nowrap sm:block">
              <div
                className={cn(
                  "text-sm font-semibold",
                  active || done ? "text-ink-900" : "text-ink-500",
                )}
              >
                {s.title}
              </div>
              <div className="text-[10px] text-ink-400">{s.subtitle}</div>
            </div>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-6 bg-ink-200 sm:w-8" />}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Step 1 — Identity
// =============================================================================
function StepIdentity(props: {
  data: CreateTokenPayload;
  update: <K extends keyof CreateTokenPayload>(k: K, v: CreateTokenPayload[K]) => void;
  patch: <K extends keyof CreateTokenPayload>(k: K, p: Partial<CreateTokenPayload[K]>) => void;
  imagePreview: string | null;
  onImage: (e: ChangeEvent<HTMLInputElement>) => void;
  bannerPreview: string | null;
  onBanner: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const { data, update, patch, imagePreview, onImage, bannerPreview, onBanner } = props;
  return (
    <Section title="Token Identity" subtitle="What is your project called?">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Token name" required>
          <input
            value={data.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. TonRocket"
            className="input-base"
            maxLength={32}
          />
        </Field>
        <Field label="Symbol / Ticker" required hint="3-10 chars, uppercase">
          <input
            value={data.symbol}
            onChange={(e) => update("symbol", e.target.value.toUpperCase())}
            placeholder="e.g. TROCK"
            className="input-base font-mono"
            maxLength={10}
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={data.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="A short pitch for your token…"
          rows={3}
          className="input-base resize-none"
          maxLength={500}
        />
        <div className="mt-1 text-right text-[11px] text-ink-400">
          {data.description.length}/500
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total supply" hint="Fixed at 1,000,000,000 by the platform">
          <input
            type="text"
            value={data.totalSupply.toLocaleString("en-US")}
            readOnly
            disabled
            className="input-base font-mono cursor-not-allowed bg-ink-50 text-ink-500"
          />
        </Field>
        <Field label="Decimals" hint="Standard is 9 for TON jettons">
          <input
            type="number"
            value={data.decimals}
            onChange={(e) => update("decimals", clamp(Number(e.target.value), 0, 18))}
            min={0}
            max={18}
            className="input-base font-mono"
          />
        </Field>
      </div>

      <Field label="Logo image" hint="Square, ≤5MB. PNG/JPG/SVG.">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-ink-200 bg-white p-3 transition-colors hover:border-ton-400">
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="" className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-ink-100 text-ink-400">
              <ImageIcon size={20} />
            </div>
          )}
          <span className="text-sm font-medium text-ink-600">
            {imagePreview ? "Change image" : "Click to upload"}
          </span>
          <input type="file" accept="image/*" onChange={onImage} className="hidden" />
        </label>
      </Field>

      <Field label="Banner image" hint="Wide cover (≈3:1). ≤8MB. Shown on token cards & detail header.">
        <label className="block cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-ink-200 bg-white transition-colors hover:border-ton-400">
          {bannerPreview ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bannerPreview} alt="" className="h-32 w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/40 to-transparent p-2">
                <span className="rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-ink-700">
                  Change banner
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-32 w-full flex-col items-center justify-center gap-1 text-ink-400">
              <ImageIcon size={22} />
              <span className="text-sm font-medium text-ink-600">Click to upload banner</span>
              <span className="text-[11px] text-ink-400">Optional · 1500×500 recommended</span>
            </div>
          )}
          <input type="file" accept="image/*" onChange={onBanner} className="hidden" />
        </label>
      </Field>

      <Section title="Social links" subtitle="Optional — helps users find you" compact>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Website">
            <input
              value={data.social.website ?? ""}
              onChange={(e) => patch("social", { website: e.target.value || undefined })}
              placeholder="https://"
              className="input-base"
            />
          </Field>
          <Field label="Twitter / X">
            <input
              value={data.social.twitter ?? ""}
              onChange={(e) => patch("social", { twitter: e.target.value || undefined })}
              placeholder="@handle"
              className="input-base"
            />
          </Field>
          <Field label="Telegram">
            <input
              value={data.social.telegram ?? ""}
              onChange={(e) => patch("social", { telegram: e.target.value || undefined })}
              placeholder="t.me/group"
              className="input-base"
            />
          </Field>
          <Field label="YouTube">
            <input
              value={data.social.youtube ?? ""}
              onChange={(e) => patch("social", { youtube: e.target.value || undefined })}
              placeholder="youtube.com/@channel"
              className="input-base"
            />
          </Field>
          <Field label="TikTok">
            <input
              value={data.social.tiktok ?? ""}
              onChange={(e) => patch("social", { tiktok: e.target.value || undefined })}
              placeholder="tiktok.com/@handle"
              className="input-base"
            />
          </Field>
          <Field label="GitHub">
            <input
              value={data.social.github ?? ""}
              onChange={(e) => patch("social", { github: e.target.value || undefined })}
              placeholder="https://example.com/repo"
              className="input-base"
            />
          </Field>
        </div>
      </Section>
    </Section>
  );
}

// =============================================================================
// Step 2 — Allocation
// =============================================================================
function StepAllocation(props: {
  data: CreateTokenPayload;
  patch: <K extends keyof CreateTokenPayload>(k: K, p: Partial<CreateTokenPayload[K]>) => void;
  sum: number;
}) {
  const { data, patch, sum } = props;
  const ok = sum === 100;
  return (
    <Section
      title="Token Allocation"
      subtitle="Sliders auto-balance to 100% — moving one rebalances the others"
    >
      <div className="space-y-5">
        <AllocSlider
          label="Presale"
          color="bg-ton-500"
          value={data.allocations.presale}
          onChange={(v) =>
            patch("allocations", rebalanceAllocations(data.allocations, "presale", v))
          }
        />
        <AllocSlider
          label="Liquidity"
          color="bg-ton-300"
          value={data.allocations.liquidity}
          onChange={(v) =>
            patch("allocations", rebalanceAllocations(data.allocations, "liquidity", v))
          }
        />
        <AllocSlider
          label="Creator"
          color="bg-ton-700"
          value={data.allocations.creator}
          onChange={(v) =>
            patch("allocations", rebalanceAllocations(data.allocations, "creator", v))
          }
        />
      </div>

      <div
        className={cn(
          "mt-2 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold",
          ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
        )}
      >
        <span>Total allocation</span>
        <span className="font-mono">{sum}%</span>
      </div>
    </Section>
  );
}

function AllocSlider(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-medium text-ink-700">
          <span className={cn("h-2 w-2 rounded-full", props.color)} />
          {props.label}
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={props.value}
          onChange={(e) => props.onChange(clamp(Number(e.target.value), 0, 100))}
          className="w-20 rounded-md border border-ink-200 px-2 py-1 text-right font-mono text-sm"
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="range-input"
      />
    </div>
  );
}

// =============================================================================
// Step 3 — Presale
// =============================================================================
function StepPresale(props: {
  data: CreateTokenPayload;
  update: <K extends keyof CreateTokenPayload>(k: K, v: CreateTokenPayload[K]) => void;
  patch: <K extends keyof CreateTokenPayload>(k: K, p: Partial<CreateTokenPayload[K]>) => void;
  pricing: PricingBreakdown;
}) {
  const { data, update, patch, pricing } = props;
  return (
    <Section title="Presale Settings" subtitle="When and how people contribute">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Soft cap (TON)" required hint="Min raise for presale to succeed">
          <input
            type="number"
            min={0}
            value={data.presale.softCap}
            onChange={(e) => patch("presale", { softCap: Number(e.target.value) })}
            className="input-base font-mono"
          />
        </Field>
        <Field label="Hard cap (TON)" required hint="Max TON raise; must be ≥ soft cap">
          <input
            type="number"
            min={0}
            value={data.presale.hardCap}
            onChange={(e) => patch("presale", { hardCap: Number(e.target.value) })}
            className="input-base font-mono"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Liquidity %" required hint="% of raised TON locked into DEX">
          <input
            type="number"
            min={0}
            max={100}
            value={data.liquidityPercent}
            onChange={(e) =>
              update("liquidityPercent", clamp(Number(e.target.value), 0, 100))
            }
            className="input-base font-mono"
          />
        </Field>
        <Field label="Min contribution (TON)">
          <input
            type="number"
            min={0}
            value={data.presale.minContribution ?? ""}
            onChange={(e) =>
              patch("presale", {
                minContribution: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="input-base font-mono"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Max contribution (TON)">
          <input
            type="number"
            min={0}
            value={data.presale.maxContribution ?? ""}
            onChange={(e) =>
              patch("presale", {
                maxContribution: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="input-base font-mono"
          />
        </Field>
        <Field label="Start time" required>
          <input
            type="datetime-local"
            value={toDatetimeLocal(new Date(data.presale.startTime))}
            onChange={(e) => patch("presale", { startTime: fromDatetimeLocal(e.target.value) })}
            className="input-base"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="End time" required>
          <input
            type="datetime-local"
            value={toDatetimeLocal(new Date(data.presale.endTime))}
            onChange={(e) => patch("presale", { endTime: fromDatetimeLocal(e.target.value) })}
            className="input-base"
          />
        </Field>
        <div />
      </div>

      <PricingBreakdown pricing={pricing} symbol={data.symbol} />
    </Section>
  );
}

// =============================================================================
// Step 4 — Review
// =============================================================================
function StepReview({
  data,
  imagePreview,
  pricing,
}: {
  data: CreateTokenPayload;
  imagePreview: string | null;
  pricing: PricingBreakdown;
}) {
  return (
    <Section title="Review & Deploy" subtitle="Double-check everything before launching">
      <div className="space-y-3">
        <ReviewSection title="Identity">
          <ReviewRow label="Name" value={data.name} />
          <ReviewRow label="Symbol" value={data.symbol} />
          <ReviewRow label="Total supply" value={data.totalSupply.toLocaleString()} />
          <ReviewRow label="Decimals" value={String(data.decimals)} />
          {imagePreview && (
            <div className="flex items-center gap-3 py-2">
              <span className="text-sm text-ink-500">Logo</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="" className="ml-auto h-10 w-10 rounded-full object-cover" />
            </div>
          )}
        </ReviewSection>

        <ReviewSection title="Allocation">
          <ReviewRow label="Presale" value={`${data.allocations.presale}%`} />
          <ReviewRow label="Liquidity" value={`${data.allocations.liquidity}%`} />
          <ReviewRow label="Creator" value={`${data.allocations.creator}%`} />
          <p className="pt-2 text-xs text-ink-500">
            Liquidity allocation is reserved for manual liquidity handling.
          </p>
        </ReviewSection>

        <ReviewSection title="Presale">
          <ReviewRow label="Soft cap" value={formatTon(data.presale.softCap)} />
          <ReviewRow label="Hard cap" value={formatTon(data.presale.hardCap)} />
          <ReviewRow label="Liquidity %" value={`${data.liquidityPercent}% of raise`} />
          <ReviewRow
            label="Schedule"
            value={`${new Date(data.presale.startTime).toLocaleString()} → ${new Date(data.presale.endTime).toLocaleString()}`}
          />
        </ReviewSection>

        <ReviewSection title="Pricing (auto-calculated)">
          <ReviewRow
            label="Tokens per 1 TON"
            value={pricing.ok ? formatRate(pricing.rate) : "—"}
          />
          <ReviewRow
            label="Presale price"
            value={pricing.ok ? `${formatPriceTon(pricing.presalePriceTon)} / ${data.symbol || "TKN"}` : "—"}
          />
          <ReviewRow
            label="Listing price"
            value={pricing.ok ? `${formatPriceTon(pricing.listingPriceTon)} / ${data.symbol || "TKN"}` : "—"}
          />
          <ReviewRow
            label="FDV at listing"
            value={pricing.ok ? formatTon(pricing.marketCapTon) : "—"}
          />
          {pricing.ok && pricing.discountPct > 0 && (
            <ReviewRow
              label="Presale discount"
              value={`−${pricing.discountPct.toFixed(1)}% vs listing`}
            />
          )}
        </ReviewSection>

        <ReviewSection title="Platform fees">
          <ReviewRow label="On raised TON" value="5% of total raise" />
          <ReviewRow label="On token supply" value="1% of total supply" />
        </ReviewSection>

        <div className="rounded-xl bg-ton-50 p-4 text-sm font-semibold text-ton-700 ring-1 ring-ton-200">
          Platform fee: 5% of raised TON + 1% of total token supply.
        </div>
      </div>
    </Section>
  );
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-100">
      <div className="bg-ink-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        {title}
      </div>
      <div className="divide-y divide-ink-100 px-4">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-ink-500">{label}</span>
      <span className="font-mono font-semibold text-ink-900">{value || "—"}</span>
    </div>
  );
}

// =============================================================================
// Reusable form bits
// =============================================================================
function Section({
  title,
  subtitle,
  children,
  compact,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn(compact ? "mt-5 space-y-3" : "space-y-5")}>
      <div>
        <h2 className={cn("font-display font-bold text-ink-900", compact ? "text-base" : "text-xl")}>
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-ink-600">
        <span>
          {label} {required && <span className="text-red-500">*</span>}
        </span>
        {hint && <span className="text-[11px] font-normal text-ink-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// =============================================================================
// Validation
// =============================================================================
interface StepCheck {
  ok: boolean;
  reason?: string;
}

function validate(d: CreateTokenPayload) {
  const bySteps: Record<Step, StepCheck> = { 0: { ok: true }, 1: { ok: true }, 2: { ok: true }, 3: { ok: true } };

  // Step 0
  if (!d.name.trim()) bySteps[0] = { ok: false, reason: "Name is required" };
  else if (d.symbol.length < 2 || d.symbol.length > 10)
    bySteps[0] = { ok: false, reason: "Symbol must be 2-10 characters" };
  else if (d.totalSupply < 1) bySteps[0] = { ok: false, reason: "Total supply must be > 0" };

  // Step 1
  const sum = d.allocations.presale + d.allocations.liquidity + d.allocations.creator;
  if (sum !== 100) bySteps[1] = { ok: false, reason: `Allocations must sum to 100% (currently ${sum}%)` };

  // Step 2
  const pricing = computePricing(d);
  if (!pricing.ok)
    bySteps[2] = {
      ok: false,
      reason: "Set total supply, presale allocation, hard cap, and liquidity allocation",
    };
  else if (d.presale.softCap <= 0) bySteps[2] = { ok: false, reason: "Soft cap must be > 0" };
  else if (d.presale.hardCap < d.presale.softCap)
    bySteps[2] = { ok: false, reason: "Hard cap must be ≥ soft cap" };
  else if (new Date(d.presale.endTime).getTime() <= new Date(d.presale.startTime).getTime())
    bySteps[2] = { ok: false, reason: "End time must be after start time" };
  else if (d.liquidityPercent < 0 || d.liquidityPercent > 100)
    bySteps[2] = { ok: false, reason: "Liquidity % must be 0-100" };

  const allValid = Object.values(bySteps).every((c) => c.ok);
  return { bySteps, allValid };
}

function firstValidationError(validation: ReturnType<typeof validate>): string | null {
  const failed = Object.values(validation.bySteps).find((check) => !check.ok);
  return failed?.reason ?? null;
}
