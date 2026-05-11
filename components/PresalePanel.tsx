"use client";

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import { Wallet, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useMyContribution, useWalletBalance } from "@/lib/hooks";
import {
  buildContributeTransaction,
  normalizeTonConnectError,
} from "@/lib/tonLaunchpad";
import {
  buildBurnUnsoldTokensTransaction,
  buildCancelPresaleEarlyTransaction,
  buildEndPresaleEarlyTransaction,
  getPresaleFactoryOwner,
  sameTonAddress,
} from "@/lib/presaleControls";
import { canBurnUnsoldTokens } from "@/lib/presaleActionState";
import { hardCapRemaining, useEffectivePresale } from "@/lib/presaleStatus";
import { cn, formatNumber, formatTon, timeUntil } from "@/lib/utils";
import type { Token } from "@/lib/types";

interface Props {
  token: Token;
}

export function PresalePanel({ token }: Props) {
  const presale = useEffectivePresale(token.presale);
  const wallet = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const { mutate } = useSWRConfig();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"contribute" | "claim" | "refund" | "end" | "cancel" | "burn" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [poolMissingSince, setPoolMissingSince] = useState<number | null>(null);
  const [factoryOwner, setFactoryOwner] = useState<string | null>(null);
  const [ownerLookupFailed, setOwnerLookupFailed] = useState(false);
  const [burnConfirmOpen, setBurnConfirmOpen] = useState(false);

  const { data: myContrib, mutate: refreshContrib } = useMyContribution(
    token.id,
    wallet || null,
  );
  const { data: walletBalance, isLoading: balanceLoading, mutate: refreshBalance } =
    useWalletBalance(wallet || null);

  const numAmount = parseFloat(amount);
  const validAmount = !Number.isNaN(numAmount) && numAmount > 0;
  const tokensReceived = validAmount ? numAmount * presale.rate : 0;

  const min = presale.minContribution;
  const max = presale.maxContribution;
  const remaining = hardCapRemaining(presale);
  const belowMin = min !== undefined && validAmount && numAmount < min;
  const aboveMax = max !== undefined && validAmount && numAmount > max;
  const aboveRemaining = validAmount && numAmount > remaining;
  const isCreator = !!wallet && sameTonAddress(wallet, token.creator);
  const isFactoryOwner = !!wallet && !!factoryOwner && sameTonAddress(wallet, factoryOwner);
  const canManagePresale = isCreator || isFactoryOwner;
  const poolReady = !!token.presalePoolAddress;
  const burnedTokens = token.allocationBreakdown?.burnedTokens ?? 0;
  const estimatedSoldTokens = presale.raised * presale.rate;
  const burnableTokens = Math.max((token.allocationBreakdown?.presaleTokens ?? 0) - estimatedSoldTokens, 0);
  const showBurnUnsoldAction =
    canManagePresale &&
    poolReady &&
    canBurnUnsoldTokens({
      status: presale.status,
      raised: presale.raised,
      softCap: presale.softCap,
      hardCap: presale.hardCap,
      burnedTokens,
    }) &&
    burnableTokens > 0;
  const panelTitle =
    burnedTokens > 0 ? "Ended — unsold tokens burned" : labelForStatus(presale.status);
  const setupTakingLong =
    presale.status === "live" &&
    !poolReady &&
    poolMissingSince !== null &&
    Date.now() - poolMissingSince > 60_000;

  useEffect(() => {
    if (presale.status === "live" && !poolReady) {
      setPoolMissingSince((value) => value ?? Date.now());
    } else {
      setPoolMissingSince(null);
    }
  }, [poolReady, presale.status]);

  useEffect(() => {
    let cancelled = false;
    const poolAddress = token.presalePoolAddress;
    if (!poolAddress) {
      setFactoryOwner(null);
      setOwnerLookupFailed(false);
      return;
    }
    getPresaleFactoryOwner(poolAddress)
      .then((owner) => {
        if (!cancelled) {
          setFactoryOwner(owner);
          setOwnerLookupFailed(false);
        }
      })
      .catch((err) => {
        console.warn("Factory owner lookup unavailable for presale controls.", err);
        if (!cancelled) {
          setFactoryOwner(null);
          setOwnerLookupFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token.presalePoolAddress]);

  async function send(boc: LaunchTxDebug) {
    const tx = {
      validUntil: boc.validUntil,
      messages: [{ address: boc.to, amount: boc.amountNano, payload: boc.payload }],
    };
    return withWalletTimeout(tonConnectUI.sendTransaction(tx), 60_000);
  }

  async function handleContribute() {
    if (!wallet || !tonConnectUI.connected) {
      tonConnectUI.openModal();
      return;
    }
    if (presale.status !== "live") {
      setError(presale.status === "upcoming" ? "Presale has not started yet." : "Presale has ended.");
      return;
    }
    if (!validAmount) {
      setError("Enter a valid TON amount.");
      return;
    }
    if (belowMin) {
      setError(`Minimum contribution is ${min} TON.`);
      return;
    }
    if (aboveMax) {
      setError(`Maximum contribution is ${max} TON.`);
      return;
    }
    if (aboveRemaining) {
      setError(`Only ${remaining.toFixed(2)} TON remains before the hard cap.`);
      return;
    }
    const poolAddress = token.presalePoolAddress;
    if (!poolAddress) {
      return;
    }
    setBusy("contribute");
    setError(null);
    let attemptedTx: LaunchTxDebug | null = null;
    try {
      const boc = buildContributeTransaction(poolAddress, numAmount);
      attemptedTx = boc;
      console.debug("[contribute] sendTransaction payload", {
        wallet,
        connected: tonConnectUI.connected,
        account: tonConnectUI.account,
        walletDevice: tonConnectUI.wallet?.device,
        walletName:
          tonConnectUI.wallet && "name" in tonConnectUI.wallet
            ? tonConnectUI.wallet.name
            : undefined,
        presalePoolAddress: poolAddress,
        destination: boc.to,
        amountTon: numAmount,
        amountNano: boc.amountNano,
        validUntil: boc.validUntil,
        bodyPresent: !!boc.payload,
        payload: boc.payload,
      });
      const result = await send(boc);
      console.debug("[contribute] sendTransaction result", result);
      setTxHash(result.boc);
      const nextRaised = Math.min(presale.hardCap, presale.raised + numAmount);
      if (nextRaised >= presale.hardCap) {
        await mutate(
          ["token", token.id],
          (current?: Token): Token | undefined =>
            current
              ? {
                  ...current,
                  presale: {
                    ...current.presale,
                    raised: nextRaised,
                    endTime: new Date().toISOString(),
                    status: "succeeded" as const,
                  },
                }
              : current,
          false,
        );
      }
      await api.presale.recordContribution(token.id, {
        wallet,
        amountTon: numAmount,
        tokenAmount: tokensReceived,
        txHash: result.boc,
        transactionBoc: result.boc,
      })
        .catch((err) => console.warn("Contribution record unavailable; waiting for indexer.", err));
      void mutate(["token", token.id]);
      void mutate(["txs", token.id, 25]);
      void mutate(["profile", wallet]);
      void mutate(["myContrib", token.id, wallet]);
      void mutate(["stats"]);
      setAmount("");
      refreshContrib();
      refreshBalance();
    } catch (err) {
      if (isWalletTimeout(err)) {
        tonConnectUI.closeModal();
      }
      console.error("Contribution transaction failed", {
        error: err,
        wallet,
        presalePoolAddress: poolAddress,
        amountTon: numAmount,
        amountNano: attemptedTx?.amountNano,
        validUntil: attemptedTx?.validUntil,
        bodyPresent: !!attemptedTx?.payload,
      });
      setError(err instanceof ApiError ? err.message : normalizeTonConnectError(err));
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
      await api.presale
        .recordClaim(token.id, {
          wallet,
          txHash: result.boc,
          transactionBoc: result.boc,
        })
        .catch((err) => console.warn("Claim record unavailable; waiting for indexer.", err));
      void mutate(["token", token.id]);
      void mutate(["txs", token.id, 25]);
      void mutate(["profile", wallet]);
      refreshContrib();
      refreshBalance();
    } catch (err) {
      console.error("Claim transaction failed", err);
      setError(err instanceof ApiError ? err.message : normalizeTonConnectError(err));
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
      await api.presale
        .recordRefund(token.id, {
          wallet,
          txHash: result.boc,
          transactionBoc: result.boc,
        })
        .catch((err) => console.warn("Refund record unavailable; waiting for indexer.", err));
      void mutate(["token", token.id]);
      void mutate(["txs", token.id, 25]);
      void mutate(["profile", wallet]);
      refreshContrib();
      refreshBalance();
    } catch (err) {
      console.error("Refund transaction failed", err);
      setError(err instanceof ApiError ? err.message : normalizeTonConnectError(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleEndPresaleEarly() {
    if (!wallet) {
      tonConnectUI.openModal();
      return;
    }
    if (!canManagePresale) {
      setError("Only the creator or Factory owner can end this presale.");
      return;
    }
    const poolAddress = token.presalePoolAddress;
    if (!poolAddress) return;
    if (presale.raised < presale.softCap) {
      setError("Soft cap must be met before ending the presale early.");
      return;
    }
    if (!(presale.status === "upcoming" || presale.status === "live")) {
      setError("This presale has already ended.");
      return;
    }
    setBusy("end");
    setError(null);
    try {
      const result = await send(buildEndPresaleEarlyTransaction(poolAddress));
      setTxHash(result.boc);
      await mutate(
        ["token", token.id],
        (current?: Token): Token | undefined =>
          current
            ? {
                ...current,
                presale: {
                  ...current.presale,
                  endTime: new Date().toISOString(),
                  status: "succeeded" as const,
                },
              }
            : current,
        false,
      );
      void mutate(["token", token.id]);
      void mutate(["txs", token.id, 25]);
    } catch (err) {
      console.error("End presale transaction failed", err);
      setError(normalizeTonConnectError(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancelPresaleEarly() {
    if (!wallet) {
      tonConnectUI.openModal();
      return;
    }
    if (!canManagePresale) {
      setError("Only the creator or Factory owner can cancel this presale.");
      return;
    }
    const poolAddress = token.presalePoolAddress;
    if (!poolAddress) return;
    if (presale.raised >= presale.softCap) {
      setError("Soft cap has been met, so this presale can no longer be cancelled.");
      return;
    }
    if (!(presale.status === "upcoming" || presale.status === "live")) {
      setError("This presale has already ended.");
      return;
    }
    setBusy("cancel");
    setError(null);
    try {
      const result = await send(buildCancelPresaleEarlyTransaction(poolAddress));
      setTxHash(result.boc);
      await mutate(
        ["token", token.id],
        (current?: Token): Token | undefined =>
          current
            ? {
                ...current,
                presale: {
                  ...current.presale,
                  endTime: new Date().toISOString(),
                  status: "failed" as const,
                },
              }
            : current,
        false,
      );
      void mutate(["token", token.id]);
      void mutate(["txs", token.id, 25]);
    } catch (err) {
      console.error("Cancel presale transaction failed", err);
      setError(normalizeTonConnectError(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleBurnUnsoldTokens() {
    if (!wallet) {
      tonConnectUI.openModal();
      return;
    }
    if (!canManagePresale) {
      setError("Only the creator or Factory owner can burn unsold tokens.");
      return;
    }
    const poolAddress = token.presalePoolAddress;
    if (!poolAddress) return;
    if (!showBurnUnsoldAction) {
      setError("Unsold tokens are not available to burn for this presale.");
      return;
    }
    setBusy("burn");
    setError(null);
    try {
      const result = await send(buildBurnUnsoldTokensTransaction(poolAddress));
      setTxHash(result.boc);
      setBurnConfirmOpen(false);
      await mutate(
        ["token", token.id],
        (current?: Token): Token | undefined =>
          current
            ? {
                ...current,
                presale: {
                  ...current.presale,
                  status: "succeeded" as const,
                  endTime: new Date().toISOString(),
                },
                allocationBreakdown: current.allocationBreakdown
                  ? {
                      ...current.allocationBreakdown,
                      burnedTokens: burnableTokens,
                      presaleTokens: Math.max(current.allocationBreakdown.presaleTokens - burnableTokens, 0),
                    }
                  : current.allocationBreakdown,
              }
            : current,
        false,
      );
      void mutate(["token", token.id]);
      void mutate(["txs", token.id, 25]);
      void mutate(["profile", wallet]);
      void mutate(["stats"]);
      refreshBalance();
    } catch (err) {
      console.error("Burn unsold tokens transaction failed", err);
      setError(normalizeTonConnectError(err));
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
          {panelTitle}
        </h3>
        <span className="font-mono text-xs text-ink-500">
          1 TON = {presale.rate.toLocaleString()} {token.symbol}
        </span>
      </div>

      {presale.status === "upcoming" && (
        <InfoBox>
          Presale starts in <strong>{timeUntil(presale.startTime)}</strong>
        </InfoBox>
      )}

      {presale.status === "live" && (
        <ContributeForm
          symbol={token.symbol}
          amount={amount}
          onAmount={setAmount}
          tokensReceived={tokensReceived}
          min={min}
          max={max}
          belowMin={belowMin}
          aboveMax={aboveMax}
          aboveRemaining={aboveRemaining}
          remaining={remaining}
          wallet={wallet || null}
          poolReady={poolReady}
          setupTakingLong={setupTakingLong}
          busy={busy === "contribute"}
          onSubmit={handleContribute}
          endTime={presale.endTime}
          walletBalanceTon={walletBalance?.balanceTon}
          balanceLoading={balanceLoading}
        />
      )}

      {canManagePresale && poolReady && (presale.status === "upcoming" || presale.status === "live") && (
        <div className="space-y-3 rounded-xl bg-ink-50 p-4 ring-1 ring-ink-100">
          <div>
            <div className="text-sm font-semibold text-ink-800">Creator controls</div>
            <div className="mt-1 text-xs text-ink-600">
              End a soft-cap sale early or cancel before soft cap if needed.
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={handleEndPresaleEarly}
              disabled={busy !== null || presale.raised < presale.softCap}
              className="btn-primary w-full"
            >
              {busy === "end" ? <Spinner /> : "End Presale"}
            </button>
            <button
              onClick={handleCancelPresaleEarly}
              disabled={busy !== null || presale.raised >= presale.softCap}
              className="btn-ghost w-full"
            >
              {busy === "cancel" ? <Spinner /> : "Cancel Presale"}
            </button>
          </div>
          {ownerLookupFailed && !isCreator && (
            <div className="text-xs text-ink-500">
              Factory owner check is temporarily unavailable. Creator controls remain available.
            </div>
          )}
        </div>
      )}

      {presale.status === "succeeded" && myContrib && myContrib.tokensOwed > 0 && (
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

      {showBurnUnsoldAction && (
        <div className="space-y-3 rounded-xl bg-ton-50 p-4 ring-1 ring-ton-200">
          <div>
            <div className="text-sm font-semibold text-ton-800">Burn Unsold Tokens</div>
            <div className="mt-1 text-xs text-ton-700">
              Burn remaining unsold presale tokens. TON payouts route automatically on close.
            </div>
            <div className="mt-2 text-xs font-medium text-ton-700">
              Burnable now: {formatNumber(burnableTokens, 0)} {token.symbol}
            </div>
          </div>
          <button
            onClick={() => setBurnConfirmOpen(true)}
            disabled={busy !== null}
            className="btn-primary w-full"
          >
            {busy === "burn" ? <Spinner /> : "Burn Unsold Tokens"}
          </button>
        </div>
      )}

      {presale.status === "succeeded" && burnedTokens > 0 && (
        <InfoBox>
          Ended — unsold tokens burned. {formatNumber(burnedTokens, 0)} {token.symbol} were removed from the remaining presale allocation.
        </InfoBox>
      )}

      {presale.status === "failed" && myContrib && myContrib.amountTon > 0 && (
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

      {presale.status === "finalized" && (
        <InfoBox>Presale finalized. The creator handles liquidity manually off-platform.</InfoBox>
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

      {!wallet && presale.status !== "finalized" && (
        <div className="flex items-center gap-2 rounded-lg bg-ton-50 p-3 text-sm text-ton-700 ring-1 ring-ton-100">
          <Wallet size={16} />
          Connect your TON wallet to participate
        </div>
      )}

      {burnConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h4 className="font-display text-lg font-semibold text-ink-900">Burn Unsold Tokens</h4>
            <p className="mt-2 text-sm text-ink-600">
              Clicking this will burn all remaining unsold presale tokens. This action is irreversible.
            </p>
            <div className="mt-4 rounded-xl bg-ink-50 p-3 text-sm text-ink-700">
              Remaining burnable amount: <span className="font-mono font-semibold">{formatNumber(burnableTokens, 0)} {token.symbol}</span>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBurnConfirmOpen(false)}
                className="btn-ghost"
                disabled={busy === "burn"}
              >
                Keep tokens
              </button>
              <button
                type="button"
                onClick={handleBurnUnsoldTokens}
                className="btn-primary"
                disabled={busy === "burn"}
              >
                {busy === "burn" ? <Spinner /> : "Confirm burn"}
              </button>
            </div>
          </div>
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
  aboveRemaining: boolean;
  remaining: number;
  wallet: string | null;
  poolReady: boolean;
  setupTakingLong: boolean;
  busy: boolean;
  onSubmit: () => void;
  endTime: string;
  walletBalanceTon?: number;
  balanceLoading: boolean;
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
              (props.belowMin || props.aboveMax || props.aboveRemaining) && "ring-2 ring-red-300",
            )}
          />
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-500">
            TON
          </div>
        </div>
        {(props.belowMin || props.aboveMax || props.aboveRemaining) && (
          <div className="mt-1 text-xs text-red-600">
            {props.belowMin && `Below minimum of ${props.min} TON`}
            {props.aboveMax && `Above maximum of ${props.max} TON`}
            {props.aboveRemaining && `Only ${props.remaining.toFixed(2)} TON remains before hard cap`}
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

      <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-ink-100">
        <span className="text-ink-500">Wallet balance</span>
        <span className="font-mono font-semibold text-ink-900">
          {!props.wallet
            ? "Connect wallet to view balance"
            : props.balanceLoading
              ? "Loading..."
              : props.walletBalanceTon !== undefined
                ? formatTon(props.walletBalanceTon, 2)
                : "Unavailable"}
        </span>
      </div>

      <button
        onClick={props.onSubmit}
        disabled={
          !props.poolReady ||
          (!!props.wallet && !props.amount) ||
          props.busy ||
          props.belowMin ||
          props.aboveMax ||
          props.aboveRemaining
        }
        className="btn-primary w-full"
      >
        {props.busy ? <Spinner /> : !props.poolReady ? "Finalizing presale setup..." : props.wallet ? "Contribute" : "Connect wallet"}
      </button>

      {!props.poolReady && (
        <div className="rounded-lg bg-ton-50 px-3 py-2 text-center text-xs font-medium text-ton-700 ring-1 ring-ton-100">
          {props.setupTakingLong
            ? "Setup is taking longer than expected. Refresh or check transaction."
            : "Finalizing presale setup..."}
        </div>
      )}

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

type LaunchTxDebug = {
  to: string;
  amountNano: string;
  payload: string;
  validUntil: number;
};

function withWalletTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Wallet confirmation timed out. Please try again.")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isWalletTimeout(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("timed out");
}
