import { launchToToken } from "../backend/src/mappers";

describe("backend token mapper", () => {
  it("returns stored allocation snapshots and resolved pool address", () => {
    const createdAt = new Date("2026-05-11T12:00:00.000Z");
    const launch = {
      id: "launch_123",
      tokenName: "Alpha",
      symbol: "alp",
      description: "Alpha token",
      logoUrl: "https://tonpad.org/icon.png",
      metadataUrl: "https://tonpad.org/api/metadata/alpha",
      creatorWallet: "EQCreator",
      factoryAddress: "EQFactory",
      tokenMasterAddress: "EQToken",
      presalePoolAddress: "EQPool",
      txHash: "0xtx",
      softCap: 10,
      hardCap: 25,
      raisedTon: 12.5,
      liquidityPercent: 70,
      status: "upcoming",
      startTime: createdAt,
      endTime: new Date("2026-05-11T13:00:00.000Z"),
      totalSupply: 1_000_000_000,
      decimals: 9,
      presaleRate: 5000,
      minContribution: 0.1,
      maxContribution: 5,
      presaleAllocation: 50,
      liquidityAllocation: 30,
      creatorAllocation: 20,
      presaleTokens: 490_000_000,
      liquidityTokens: 300_000_000,
      creatorTokens: 200_000_000,
      presaleTON: 12.5,
      liquidityTON: 8.75,
      platformFeeTON: 0.625,
      creatorTON: 3.125,
      platformTonTreasury: "EQTonTreasury",
      platformTokenTreasury: "EQTokenTreasury",
      liquidityTreasury: null,
      platformTonFeeBps: 500,
      platformTokenFeeBps: 100,
      platformTokenFeeAmount: 10_000_000,
      platformTokenFeeTonTreasuryShare: 5_000_000,
      platformTokenFeeTokenTreasuryShare: 5_000_000,
      liquidityTonAmount: 8.75,
      creatorTreasuryAmount: 3.125,
      burnedTokens: 0,
      social: { website: "https://alpha.example" },
      pendingIndexing: false,
      lastIndexedAt: createdAt,
      updatedAt: createdAt,
      createdAt,
    } as const;

    const token = launchToToken(launch as never);

    expect(token.name).toBe("Alpha");
    expect(token.symbol).toBe("ALP");
    expect(token.presalePoolAddress).toBe("EQPool");
    expect(token.tokenMasterAddress).toBe("EQToken");
    expect(token.presale.status).toBe("upcoming");
    expect(token.allocationBreakdown).toMatchObject({
      presaleTokens: 490_000_000,
      liquidityTokens: 300_000_000,
      creatorTokens: 200_000_000,
      presaleTON: 12.5,
      liquidityTON: 8.75,
      platformFeeTON: 0.625,
      creatorTON: 3.125,
      presaleTokenFee: 10_000_000,
      burnedTokens: 0,
      liquidityReceiver: "creator",
    });
  });
});
