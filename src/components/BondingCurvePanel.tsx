"use client";

import { useState, useTransition } from "react";
import { useBondingCurveQuote } from "@/hooks/useBondingCurveQuote";
import { formatTon } from "@/lib/launches";
import { submitMockCurveTrade } from "@/services/tonicBondingCurve";

export function BondingCurvePanel({ priceTon }: { priceTon: number }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("5");
  const [message, setMessage] = useState("Mock mode. TON contract wiring lands next.");
  const [isPending, startTransition] = useTransition();
  const amountTon = Number(amount);
  const quote = useBondingCurveQuote(side, Number.isFinite(amountTon) ? amountTon : 0, priceTon);

  function submitTrade() {
    startTransition(async () => {
      const result = await submitMockCurveTrade();
      setMessage(result.ok ? `Prepared ${side} route: ${result.txHash}` : "Trade failed");
    });
  }

  return (
    <section className="rounded-lg border border-[#0098ea]/12 bg-slate-950/80 p-4 shadow-[0_0_42px_rgba(0,152,234,0.12)] sm:p-5">
      <div className="grid grid-cols-2 rounded-md border border-[#0098ea]/10 bg-black p-1">
        {(["buy", "sell"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setSide(option)}
            className={`h-10 rounded text-sm font-black uppercase transition ${
              side === option ? "bg-[#0098ea] text-black" : "text-slate-400 hover:text-white"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="mt-5 block text-sm font-bold text-slate-300" htmlFor="curve-amount">
        Amount in TON
      </label>
      <div className="mt-2 rounded-md border border-[#0098ea]/12 bg-black px-4 py-3">
        <input
          id="curve-amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-slate-700 sm:text-3xl"
          placeholder="0.00"
        />
      </div>

      <div className="mt-5 space-y-3 rounded-md border border-[#0098ea]/10 bg-white/[0.03] p-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Estimated tokens</span>
          <span className="font-bold text-white">{quote.tokens.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Price</span>
          <span className="font-bold text-white">{formatTon(priceTon)} TON</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Price impact</span>
          <span className="font-bold text-[#8fd8ff]">{quote.estimatedPriceImpact}%</span>
        </div>
      </div>

      <button
        onClick={submitTrade}
        disabled={isPending}
        className="mt-5 h-12 w-full rounded-md bg-[#0098ea] text-sm font-black uppercase text-black transition hover:bg-[#19b3ff] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Preparing..." : `${side} on curve`}
      </button>
      <p className="mt-3 text-xs leading-5 text-slate-500">{message}</p>
    </section>
  );
}
