import { computeAllocationBreakdown as computeFrontendBreakdown } from "../lib/allocationMath";
import {
  buildPersistedAllocationFields,
  computeAllocationBreakdown as computeBackendBreakdown,
  computeTONAllocation,
} from "../backend/src/allocation";

describe("allocation breakdown", () => {
  const input = {
    totalSupply: 1_000_000_000,
    presalePercent: 50,
    liquidityPercentTokens: 30,
    creatorPercent: 20,
    totalRaisedTon: 100,
    liquidityPercentOfRaised: 70,
    platformTonFeeBps: 500,
    platformTokenFeeBps: 100,
  };

  it("deducts the 1% token fee only from presale allocation", () => {
    const breakdown = computeFrontendBreakdown(input);

    expect(breakdown.presaleTokenFee).toBe(10_000_000);
    expect(breakdown.presaleTokens).toBe(490_000_000);
    expect(breakdown.liquidityTokens).toBe(300_000_000);
    expect(breakdown.creatorTokens).toBe(200_000_000);
  });

  it("splits raised TON into platform fee, liquidity, and creator remainder", () => {
    const breakdown = computeFrontendBreakdown(input);

    expect(breakdown.presaleTON).toBe(100);
    expect(breakdown.platformFeeTON).toBe(5);
    expect(breakdown.liquidityTON).toBe(70);
    expect(breakdown.creatorTON).toBe(25);
  });

  it("falls back to the creator when no liquidity wallet is set", () => {
    const breakdown = computeFrontendBreakdown({
      ...input,
      liquidityTreasurySet: false,
    });

    expect(breakdown.liquidityReceiver).toBe("creator");
  });

  it("routes liquidity to the liquidity wallet when one is set", () => {
    const breakdown = computeFrontendBreakdown({
      ...input,
      liquidityTreasurySet: true,
    });

    expect(breakdown.liquidityReceiver).toBe("liquidity");
  });

  it("matches backend allocation math", () => {
    expect(computeBackendBreakdown({ ...input, liquidityTreasurySet: true })).toEqual(
      computeFrontendBreakdown({ ...input, liquidityTreasurySet: true }),
    );
  });

  it("reduces buyer-claimable presale tokens after unsold tokens are burned", () => {
    const breakdown = computeFrontendBreakdown({
      ...input,
      burnedTokens: 90_000_000,
    });

    expect(breakdown.presaleTokens).toBe(400_000_000);
    expect(breakdown.burnedTokens).toBe(90_000_000);
  });

  it("exposes the same TON allocation shape through the backend helper", () => {
    const breakdown = computeTONAllocation({
      ...input,
      liquidityTreasurySet: true,
      burnedTokens: 25_000_000,
    });

    expect(breakdown).toMatchObject({
      presaleTON: 100,
      liquidityTON: 70,
      platformFeeTON: 5,
      creatorTON: 25,
      presaleTokens: 465_000_000,
      liquidityTokens: 300_000_000,
      creatorTokens: 200_000_000,
      presaleTokenFee: 10_000_000,
      burnedTokens: 25_000_000,
      liquidityReceiver: "liquidity",
    });
  });

  it("builds persisted allocation fields for database writes", () => {
    const persisted = buildPersistedAllocationFields({
      ...input,
      burnedTokens: 90_000_000,
    });

    expect(persisted).toEqual({
      presaleTokens: 400_000_000,
      liquidityTokens: 300_000_000,
      creatorTokens: 200_000_000,
      presaleTON: 100,
      liquidityTON: 70,
      platformFeeTON: 5,
      creatorTON: 25,
      burnedTokens: 90_000_000,
    });
  });
});
