"use client";

import { useState, useMemo, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Rocket,
  Wallet,
} from "lucide-react";
import {
  BUYBACK_PRESETS,
  DEFAULT_BUYBACK_PRESET_ID,
  formatBuybackRate,
  formatInterval,
  findPresetByRate,
} from "@/lib/buyback";
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
import { saveRecentLaunch, tokenFromLaunchInput } from "@/lib/recentLaunches";
import { TokenPreview } from "./TokenPreview";

type Step = 0 | 1 | 2 | 3 | 4;
const STEPS: { title: string; subtitle: string }[] = [
  { title: "Token", subtitle: "Identity & branding" },
  { title: "Allocation", subtitle: "Token distribution" },
  { title: "Presale", subtitle: "Cap, rate, schedule" },
  { title: "Buybacks", subtitle: "Programmatic price support" },
  { title: "Review", subtitle: "Confirm & deploy" },
];

const defaultPreset = BUYBACK_PRESETS.find((p) => p.id === DEFAULT_BUYBACK_PRESET_ID)!;

const initialPayload = (): CreateTokenPayload => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000); // +1h
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7d
  return {
    name: "",
    symbol: "",
    description: "",
    imageUrl: null,
    totalSupply: 1_000_000_000,
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
    buyback: {
      enabled: true,
      percent: 20,
      rate: defaultPreset.rate,
    },
    liquidityPercent: 70,
    social: {},
    creator: "",
  };
};

export function CreateTokenForm() {
  const wallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const router = useRouter();

  const [step, setStep] = useState<Step>(0);
  const [data, setData] = useState<CreateTokenPayload>(initialPayload);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metadataNotice, setMetadataNotice] = useState<string | null>(null);
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Validation per step
  // ---------------------------------------------------------------------
  const validation = useMemo(() => validate(data), [data]);
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

  // ---------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------
  async function handleDeploy() {
    setError(null);
    setDeployStatus(null);
    setTxResult(null);
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
        imageUrl,
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
      const launchId = `recent-${Date.now().toString(36)}`;
      const createdAt = new Date().toISOString();
      const factoryAddress = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;
      const token = tokenFromLaunchInput({
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
      api.tokens
        .create({
          ...payload,
          transactionBoc: result.boc,
          factoryAddress,
          dexAdapterAddress: process.env.NEXT_PUBLIC_DEX_ADAPTER_ADDRESS,
          tokenMasterAddress: null,
          presalePoolAddress: null,
        })
        .catch((err) => {
          console.warn("Indexer temporarily unavailable. Launch kept in local fallback cache.", err);
      });

      setTxResult(result.boc);
      setExplorerUrl(testnetExplorerUrl({ address: factoryAddress ?? wallet }));
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
          Launch submitted successfully. Your token and presale pool are being created on TON
          testnet.
        </p>
        <p className="mt-2 text-xs text-amber-600">
          Presale is being indexed. It may appear shortly.
        </p>
        {data.name && (
          <div className="mt-4 rounded-lg bg-ink-50 p-3">
            <div className="text-sm font-semibold text-ink-900">
              {data.name} <span className="font-mono text-ink-500">{data.symbol}</span>
            </div>
            <div className="mt-1 text-xs font-medium text-amber-600">Pending indexing</div>
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
  const isLast = step === 4;

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
            />
          )}
          {step === 1 && <StepAllocation data={data} patch={patch} sum={allocSum} />}
          {step === 2 && <StepPresale data={data} update={update} patch={patch} />}
          {step === 3 && <StepBuyback data={data} update={update} patch={patch} />}
          {step === 4 && <StepReview data={data} imagePreview={imagePreview} />}

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
        <TokenPreview data={data} imagePreview={imagePreview} />
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
}) {
  const { data, update, patch, imagePreview, onImage } = props;
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
        <Field label="Total supply" required>
          <input
            type="number"
            value={data.totalSupply}
            onChange={(e) => update("totalSupply", Number(e.target.value))}
            min={1}
            className="input-base font-mono"
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
    <Section title="Token Allocation" subtitle="Must sum to exactly 100%">
      <div className="space-y-5">
        <AllocSlider
          label="Presale"
          color="bg-ton-500"
          value={data.allocations.presale}
          onChange={(v) => patch("allocations", { presale: v })}
        />
        <AllocSlider
          label="Liquidity"
          color="bg-ton-300"
          value={data.allocations.liquidity}
          onChange={(v) => patch("allocations", { liquidity: v })}
        />
        <AllocSlider
          label="Creator"
          color="bg-ton-700"
          value={data.allocations.creator}
          onChange={(v) => patch("allocations", { creator: v })}
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
}) {
  const { data, update, patch } = props;
  return (
    <Section title="Presale Settings" subtitle="When and how people contribute">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rate (tokens per 1 TON)" required>
          <input
            type="number"
            min={1}
            value={data.presale.rate}
            onChange={(e) => patch("presale", { rate: Number(e.target.value) })}
            className="input-base font-mono"
          />
        </Field>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Soft cap (TON)" required>
          <input
            type="number"
            min={0}
            value={data.presale.softCap}
            onChange={(e) => patch("presale", { softCap: Number(e.target.value) })}
            className="input-base font-mono"
          />
        </Field>
        <Field label="Hard cap (TON)" required hint="Must be ≥ soft cap">
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start time" required>
          <input
            type="datetime-local"
            value={toDatetimeLocal(new Date(data.presale.startTime))}
            onChange={(e) => patch("presale", { startTime: fromDatetimeLocal(e.target.value) })}
            className="input-base"
          />
        </Field>
        <Field label="End time" required>
          <input
            type="datetime-local"
            value={toDatetimeLocal(new Date(data.presale.endTime))}
            onChange={(e) => patch("presale", { endTime: fromDatetimeLocal(e.target.value) })}
            className="input-base"
          />
        </Field>
      </div>
    </Section>
  );
}

// =============================================================================
// Step 4 — BUYBACKS (the headline feature)
// =============================================================================
function StepBuyback(props: {
  data: CreateTokenPayload;
  update: <K extends keyof CreateTokenPayload>(k: K, v: CreateTokenPayload[K]) => void;
  patch: <K extends keyof CreateTokenPayload>(k: K, p: Partial<CreateTokenPayload[K]>) => void;
}) {
  const { data, patch } = props;
  const enabled = data.buyback.enabled;

  return (
    <Section
      title="Programmatic Buybacks"
      subtitle="Automatic token buybacks supporting the price after launch"
    >
      {/* Master toggle */}
      <div className="flex items-start justify-between rounded-2xl border border-ink-100 bg-gradient-to-br from-white to-ton-50/50 p-5">
        <div>
          <div className="font-display text-base font-semibold text-ink-900">
            Enable buybacks
          </div>
          <p className="mt-1 max-w-md text-xs text-ink-500">
            A portion of post-launch trading fees and treasury TON is automatically used to buy
            back your token at a fixed cadence.
          </p>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => patch("buyback", { enabled: v })}
          label="Buybacks"
        />
      </div>

      {/* Buyback budget % slider 0-40 */}
      <div
        className={cn(
          "transition-opacity",
          enabled ? "opacity-100" : "pointer-events-none opacity-40",
        )}
      >
        <div className="rounded-2xl border border-ink-100 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-ink-900">Buyback budget</div>
              <div className="text-xs text-ink-500">
                Share of treasury allocated to buybacks (0–40%)
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl font-bold text-ton-600">
                {data.buyback.percent}%
              </div>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={data.buyback.percent}
            onChange={(e) => patch("buyback", { percent: Number(e.target.value) })}
            className="range-input mt-4"
          />
          <div className="mt-1 flex justify-between text-[11px] text-ink-400">
            <span>0%</span>
            <span>10%</span>
            <span>20%</span>
            <span>30%</span>
            <span>40%</span>
          </div>
        </div>

        {/* Cadence presets */}
        <div className="mt-4 rounded-2xl border border-ink-100 p-5">
          <div className="mb-3">
            <div className="text-sm font-semibold text-ink-900">Buyback cadence</div>
            <div className="text-xs text-ink-500">
              How quickly the budget is consumed. Smaller chunks = smoother price impact.
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {BUYBACK_PRESETS.map((p) => {
              const active =
                data.buyback.rate.percent === p.rate.percent &&
                data.buyback.rate.intervalMinutes === p.rate.intervalMinutes;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => patch("buyback", { rate: p.rate })}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    active
                      ? "border-ton-500 bg-ton-50 ring-2 ring-ton-200"
                      : "border-ink-200 bg-white hover:border-ton-300",
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span
                      className={cn(
                        "font-display text-sm font-semibold",
                        active ? "text-ton-700" : "text-ink-900",
                      )}
                    >
                      {p.label}
                    </span>
                    <span className="font-mono text-xs font-semibold text-ink-700">
                      {p.rate.percent}% / {formatInterval(p.rate.intervalMinutes)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-500">{p.description}</div>
                </button>
              );
            })}
          </div>

          <CustomCadence
            current={data.buyback.rate}
            onChange={(rate) => patch("buyback", { rate })}
          />
        </div>

        {/* Summary card */}
        <div className="mt-4 rounded-2xl bg-ton-gradient p-5 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
            Configuration summary
          </div>
          <div className="mt-2 font-display text-xl font-bold">
            {data.buyback.percent}% of treasury · {formatBuybackRate(data.buyback.rate)}
          </div>
          <div className="mt-1 text-xs opacity-90">
            Budget fully consumed in approx{" "}
            {data.buyback.rate.percent > 0
              ? formatInterval(
                  Math.ceil((100 / data.buyback.rate.percent) * data.buyback.rate.intervalMinutes),
                )
              : "—"}
          </div>
        </div>
      </div>
    </Section>
  );
}

function CustomCadence({
  current,
  onChange,
}: {
  current: { percent: number; intervalMinutes: number };
  onChange: (r: { percent: number; intervalMinutes: number }) => void;
}) {
  const isPreset = !!findPresetByRate(current);
  const [open, setOpen] = useState(!isPreset);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-ink-600 hover:bg-ink-50"
      >
        <span>Or set custom cadence</span>
        <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 grid gap-3 rounded-xl border border-ink-100 bg-ink-50/40 p-3 sm:grid-cols-2">
          <Field label="% per interval" hint="1-100">
            <input
              type="number"
              min={1}
              max={100}
              value={current.percent}
              onChange={(e) =>
                onChange({ ...current, percent: clamp(Number(e.target.value), 1, 100) })
              }
              className="input-base font-mono"
            />
          </Field>
          <Field label="Interval (minutes)" hint="≥ 1">
            <input
              type="number"
              min={1}
              value={current.intervalMinutes}
              onChange={(e) =>
                onChange({ ...current, intervalMinutes: Math.max(1, Number(e.target.value)) })
              }
              className="input-base font-mono"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        checked ? "bg-ton-500" : "bg-ink-200",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// =============================================================================
// Step 5 — Review
// =============================================================================
function StepReview({
  data,
  imagePreview,
}: {
  data: CreateTokenPayload;
  imagePreview: string | null;
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
        </ReviewSection>

        <ReviewSection title="Presale">
          <ReviewRow label="Rate" value={`${data.presale.rate.toLocaleString()} per TON`} />
          <ReviewRow label="Soft cap" value={formatTon(data.presale.softCap)} />
          <ReviewRow label="Hard cap" value={formatTon(data.presale.hardCap)} />
          <ReviewRow label="Liquidity locked" value={`${data.liquidityPercent}% of raise`} />
          <ReviewRow
            label="Schedule"
            value={`${new Date(data.presale.startTime).toLocaleString()} → ${new Date(data.presale.endTime).toLocaleString()}`}
          />
        </ReviewSection>

        <ReviewSection title="Buybacks">
          {data.buyback.enabled ? (
            <>
              <ReviewRow label="Budget" value={`${data.buyback.percent}% of treasury`} />
              <ReviewRow label="Cadence" value={formatBuybackRate(data.buyback.rate)} />
            </>
          ) : (
            <ReviewRow label="Status" value="Disabled" />
          )}
        </ReviewSection>
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
  const bySteps: Record<Step, StepCheck> = { 0: { ok: true }, 1: { ok: true }, 2: { ok: true }, 3: { ok: true }, 4: { ok: true } };

  // Step 0
  if (!d.name.trim()) bySteps[0] = { ok: false, reason: "Name is required" };
  else if (d.symbol.length < 2 || d.symbol.length > 10)
    bySteps[0] = { ok: false, reason: "Symbol must be 2-10 characters" };
  else if (d.totalSupply < 1) bySteps[0] = { ok: false, reason: "Total supply must be > 0" };

  // Step 1
  const sum = d.allocations.presale + d.allocations.liquidity + d.allocations.creator;
  if (sum !== 100) bySteps[1] = { ok: false, reason: `Allocations must sum to 100% (currently ${sum}%)` };

  // Step 2
  if (d.presale.rate < 1) bySteps[2] = { ok: false, reason: "Rate must be ≥ 1" };
  else if (d.presale.softCap <= 0) bySteps[2] = { ok: false, reason: "Soft cap must be > 0" };
  else if (d.presale.hardCap < d.presale.softCap)
    bySteps[2] = { ok: false, reason: "Hard cap must be ≥ soft cap" };
  else if (new Date(d.presale.endTime).getTime() <= new Date(d.presale.startTime).getTime())
    bySteps[2] = { ok: false, reason: "End time must be after start time" };
  else if (d.liquidityPercent < 0 || d.liquidityPercent > 100)
    bySteps[2] = { ok: false, reason: "Liquidity % must be 0-100" };

  // Step 3 — buyback
  if (d.buyback.enabled) {
    if (d.buyback.percent < 0 || d.buyback.percent > 40)
      bySteps[3] = { ok: false, reason: "Buyback % must be 0-40" };
    else if (d.buyback.rate.percent < 1 || d.buyback.rate.percent > 100)
      bySteps[3] = { ok: false, reason: "Cadence % must be 1-100" };
    else if (d.buyback.rate.intervalMinutes < 1)
      bySteps[3] = { ok: false, reason: "Interval must be ≥ 1 minute" };
  }

  const allValid = Object.values(bySteps).every((c) => c.ok);
  return { bySteps, allValid };
}

function firstValidationError(validation: ReturnType<typeof validate>): string | null {
  const failed = Object.values(validation.bySteps).find((check) => !check.ok);
  return failed?.reason ?? null;
}

function testnetExplorerUrl({ address }: { address: string }): string {
  return `https://testnet.tonviewer.com/${encodeURIComponent(address)}`;
}
