"use client";

import { useState } from "react";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { Wallet, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useMyContribution } from "@/lib/hooks";
import { cn, formatTon, timeUntil } from "@/lib/utils";
import type { Token } from "@/lib/types";

interface Props {
  token: Token;
}

export function PresalePanel({ token }: Props) {
  const wallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"contribute" | "claim" | "refund" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { data: myContrib, mutate: refreshContrib } = useMyContribution(
    token.id,
    wallet || null,
  );

  const numAmount = parseFloat(amount);
  const validAmount = !Number.isNaN(numAmount) && numAmount > 0;
  const tokensReceived = validAmount ? numAmount * token.presale.rate : 0;

  const min = token.presale.minContribution;
  const max = token.presale.maxContribution;
  const belowMin = min !== undefined && validAmount && numAmount < min;
  const aboveMax = max !== undefined && validAmount && numAmount > max;

  async function send(boc: { to: string; amountNano: string; payload: string; validUntil: number }) {
    return tonConnectUI.sendTransaction({
      validUntil: boc.validUntil,
      messages: [{ address: boc.to, amount: boc.amountNano, payload: boc.payload }],
    });
  }

  async function handleContribute() {
    if (!wallet || !validAmount || belowMin || aboveMax) return;
    setBusy("contribute");
    setError(null);
    try {
      const boc = await api.presale.contribute(token.id, numAmount, wallet);
      const result = await send(boc);
      setTxHash(result.boc);
      setAmount("");
      refreshContrib();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transaction rejected or failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleClaim() {
    if (!wallet) return;
    setBusy("claim");
    setError(null);
    try {
      const boc = await api.presale.claim(token.id, wallet);
      const result = await send(boc);
      setTxHash(result.boc);
      refreshContrib();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transaction rejected or failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRefund() {
    if (!wallet) return;
    setBusy("refund");
    setError(null);
    try {
      const boc = await api.presale.refund(token.id, wallet);
      const result = await send(boc);
      setTxHash(result.boc);
      refreshContrib();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transaction rejected or failed");
    } finally {
      setBusy(null);
    }
  }

  // -------------------------------------------------------------------------
  // Rendering by status
  // -------------------------------------------------------------------------
  return (
    <div className="glass space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink-900">
          {labelForStatus(token.presale.status)}
        </h3>
        <span className="font-mono text-xs text-ink-500">
          1 TON = {token.presale.rate.toLocaleString()} {token.symbol}
        </span>
      </div>

      {token.presale.status === "upcoming" && (
        <InfoBox>
          Presale starts in <strong>{timeUntil(token.presale.startTime)}</strong>
        </InfoBox>
      )}

      {token.presale.status === "live" && (
        <ContributeForm
          symbol={token.symbol}
          amount={amount}
          onAmount={setAmount}
          tokensReceived={tokensReceived}
          min={min}
          max={max}
          belowMin={belowMin}
          aboveMax={aboveMax}
          wallet={wallet || null}
          busy={busy === "contribute"}
          onSubmit={handleContribute}
          endTime={token.presale.endTime}
        />
      )}

      {token.presale.status === "succeeded" && myContrib && myContrib.tokensOwed > 0 && (
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <div className="text-sm text-emerald-700">Your allocation</div>
            <div className="mt-1 font-display text-2xl font-bold text-emerald-700">
              {myContrib.tokensOwed.toLocaleString()} {token.symbol}
            </div>
            <div className="mt-0.5 text-xs text-emerald-600">
              From {formatTon(myContrib.amountTon)} contributed
            </div>
          </div>
          <button
            onClick={handleClaim}
            disabled={!wallet || busy !== null || myContrib.claimed}
            className="btn-primary w-full"
          >
            {busy === "claim" ? <Spinner /> : myContrib.claimed ? "Already claimed" : "Claim tokens"}
          </button>
        </div>
      )}

      {token.presale.status === "failed" && myContrib && myContrib.amountTon > 0 && (
        <div className="space-y-3">
          <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <AlertTriangle size={16} /> Soft cap not reached
            </div>
            <div className="mt-2 text-xs text-amber-700">
              You can refund <strong>{formatTon(myContrib.amountTon)}</strong>
            </div>
          </div>
          <button
            onClick={handleRefund}
            disabled={!wallet || busy !== null}
            className="btn-primary w-full"
          >
            {busy === "refund" ? <Spinner /> : "Refund contribution"}
          </button>
        </div>
      )}

      {token.presale.status === "finalized" && (
        <InfoBox>Presale finalized — token is live on DEX. Trading happens off-platform.</InfoBox>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {txHash && !error && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>Transaction submitted — it may take a few seconds to confirm.</span>
        </div>
      )}

      {!wallet && token.presale.status !== "finalized" && (
        <div className="flex items-center gap-2 rounded-lg bg-ton-50 p-3 text-sm text-ton-700 ring-1 ring-ton-100">
          <Wallet size={16} />
          Connect your TON wallet to participate
        </div>
      )}
    </div>
  );
}

function ContributeForm(props: {
  symbol: string;
  amount: string;
  onAmount: (v: string) => void;
  tokensReceived: number;
  min?: number;
  max?: number;
  belowMin: boolean;
  aboveMax: boolean;
  wallet: string | null;
  busy: boolean;
  onSubmit: () => void;
  endTime: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-600">
          <span>Contribute</span>
          {(props.min !== undefined || props.max !== undefined) && (
            <span className="font-mono text-[11px] text-ink-400">
              {props.min !== undefined && `min ${props.min}`}
              {props.min !== undefined && props.max !== undefined && " · "}
              {props.max !== undefined && `max ${props.max}`} TON
            </span>
          )}
        </label>
        <div className="relative">
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={props.amount}
            onChange={(e) => props.onAmount(e.target.value)}
            placeholder="0.0"
            className={cn(
              "input-base pr-16 text-right font-mono text-lg",
              (props.belowMin || props.aboveMax) && "ring-2 ring-red-300",
            )}
          />
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-500">
            TON
          </div>
        </div>
        {(props.belowMin || props.aboveMax) && (
          <div className="mt-1 text-xs text-red-600">
            {props.belowMin && `Below minimum of ${props.min} TON`}
            {props.aboveMax && `Above maximum of ${props.max} TON`}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs">
        <span className="text-ink-500">You receive</span>
        <span className="font-mono font-semibold text-ink-900">
          {props.tokensReceived.toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
          {props.symbol}
        </span>
      </div>

      <button
        onClick={props.onSubmit}
        disabled={
          !props.wallet ||
          !props.amount ||
          props.busy ||
          props.belowMin ||
          props.aboveMax
        }
        className="btn-primary w-full"
      >
        {props.busy ? <Spinner /> : props.wallet ? "Contribute" : "Connect wallet"}
      </button>

      <div className="text-center text-[11px] text-ink-500">
        Ends in <span className="font-medium text-ink-700">{timeUntil(props.endTime)}</span>
      </div>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-ink-50 p-4 text-sm text-ink-600 ring-1 ring-ink-100">
      {children}
    </div>
  );
}

function Spinner() {
  return <Loader2 className="animate-spin" size={18} />;
}

function labelForStatus(s: string) {
  switch (s) {
    case "upcoming":
      return "Presale starting soon";
    case "live":
      return "Join Presale";
    case "succeeded":
      return "Claim Allocation";
    case "failed":
      return "Refund Available";
    case "finalized":
      return "Presale Finalized";
    default:
      return "Presale";
  }
}
