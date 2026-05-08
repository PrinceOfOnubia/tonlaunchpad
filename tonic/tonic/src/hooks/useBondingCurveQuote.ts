"use client";

import { useMemo } from "react";
import { getMockCurveQuote } from "@/services/tonicBondingCurve";

export function useBondingCurveQuote(side: "buy" | "sell", amountTon: number, priceTon: number) {
  return useMemo(() => {
    if (!amountTon || amountTon <= 0) {
      return {
        tokens: 0,
        estimatedPriceImpact: 0
      };
    }

    return getMockCurveQuote({ side, amountTon, priceTon });
  }, [amountTon, priceTon, side]);
}
