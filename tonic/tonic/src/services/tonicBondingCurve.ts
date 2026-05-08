export type QuoteInput = {
  side: "buy" | "sell";
  amountTon: number;
  priceTon: number;
};

export type CurveQuote = {
  tokens: number;
  estimatedPriceImpact: number;
};

export function getMockCurveQuote({ side, amountTon, priceTon }: QuoteInput): CurveQuote {
  const directionMultiplier = side === "buy" ? 1.018 : 0.982;
  const tokens = amountTon / priceTon / directionMultiplier;
  const estimatedPriceImpact = Math.min(9.8, Math.max(0.2, amountTon * 0.18));

  return {
    tokens: Math.round(tokens),
    estimatedPriceImpact: Number(estimatedPriceImpact.toFixed(2))
  };
}

export async function submitMockCurveTrade() {
  await new Promise((resolve) => setTimeout(resolve, 350));
  return {
    ok: true,
    txHash: "mock-tonic-curve-trade"
  };
}
