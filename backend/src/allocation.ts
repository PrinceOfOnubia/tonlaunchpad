export interface AllocationBreakdown {
  presaleTON: number;
  liquidityTON: number;
  platformFeeTON: number;
  creatorTON: number;
  presaleTokens: number;
  liquidityTokens: number;
  creatorTokens: number;
  presaleTokenFee: number;
  liquidityReceiver: "creator" | "liquidity";
}

export interface AllocationInputs {
  totalSupply: number;
  presalePercent: number;
  liquidityPercentTokens: number;
  creatorPercent: number;
  totalRaisedTon: number;
  liquidityPercentOfRaised: number;
  platformTonFeeBps?: number;
  platformTokenFeeBps?: number;
  liquidityTreasurySet?: boolean;
}

export function computeAllocationBreakdown(input: AllocationInputs): AllocationBreakdown {
  const platformTonFeeBps = input.platformTonFeeBps ?? 500;
  const platformTokenFeeBps = input.platformTokenFeeBps ?? 100;

  const configuredPresaleTokens = percentageOf(input.totalSupply, input.presalePercent);
  const liquidityTokens = percentageOf(input.totalSupply, input.liquidityPercentTokens);
  const creatorTokens = percentageOf(input.totalSupply, input.creatorPercent);
  const presaleTokenFee = basisPointsOf(input.totalSupply, platformTokenFeeBps);
  const presaleTokens = Math.max(configuredPresaleTokens - presaleTokenFee, 0);

  const presaleTON = input.totalRaisedTon;
  const platformFeeTON = basisPointsOf(input.totalRaisedTon, platformTonFeeBps);
  const liquidityTON = percentageOf(input.totalRaisedTon, input.liquidityPercentOfRaised);
  const creatorTON = Math.max(presaleTON - platformFeeTON - liquidityTON, 0);

  return {
    presaleTON,
    liquidityTON,
    platformFeeTON,
    creatorTON,
    presaleTokens,
    liquidityTokens,
    creatorTokens,
    presaleTokenFee,
    liquidityReceiver:
      input.liquidityPercentOfRaised > 0 && input.liquidityTreasurySet ? "liquidity" : "creator",
  };
}

function percentageOf(value: number, percent: number) {
  return (value * percent) / 100;
}

function basisPointsOf(value: number, bps: number) {
  return (value * bps) / 10000;
}
