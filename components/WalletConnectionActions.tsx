"use client";

import { useState } from "react";
import { useTonConnectUI } from "@tonconnect/ui-react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { resetTonConnectSession } from "@/lib/tonConnectSession";

export function WalletConnectionActions({ compact = false }: { compact?: boolean }) {
  const [tonConnectUI] = useTonConnectUI();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setMessage(null);
    try {
      await resetTonConnectSession(tonConnectUI);
      setMessage("Wallet connection reset. Choose a wallet again.");
    } catch (err) {
      console.error("Wallet connection reset failed", err);
      setMessage("Wallet connection failed. Please reset connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setMessage(null);
    tonConnectUI.openModal();
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ton-50 px-3 py-1.5 text-xs font-semibold text-ton-700 ring-1 ring-ton-100 transition-colors hover:bg-ton-100"
        >
          <RefreshCw size={13} /> Retry
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-700 ring-1 ring-ink-100 transition-colors hover:bg-ink-100 disabled:opacity-60"
        >
          <RotateCcw size={13} /> {busy ? "Resetting..." : "Reset connection"}
        </button>
        <button
          type="button"
          onClick={async () => {
            await reset();
            tonConnectUI.openModal();
          }}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 ring-1 ring-ink-200 transition-colors hover:bg-ink-50 disabled:opacity-60"
        >
          Choose another wallet
        </button>
      </div>
      {message && <div className="text-xs font-medium text-amber-700">{message}</div>}
    </div>
  );
}
