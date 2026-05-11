import { derivePresaleStatus } from "../lib/presaleStatus";
import type { PresaleInfo } from "../lib/types";

function presale(overrides: Partial<PresaleInfo> = {}): PresaleInfo {
  return {
    rate: 1000,
    softCap: 10,
    hardCap: 20,
    raised: 0,
    contributors: 0,
    startTime: "2026-05-11T10:00:00.000Z",
    endTime: "2026-05-11T12:00:00.000Z",
    status: "live",
    ...overrides,
  };
}

describe("derivePresaleStatus", () => {
  it("keeps a succeeded status even if the old end time is still in the future", () => {
    const status = derivePresaleStatus(
      presale({ status: "succeeded", raised: 15 }),
      new Date("2026-05-11T11:00:00.000Z").getTime(),
    );

    expect(status).toBe("succeeded");
  });

  it("keeps a failed status even if the old end time is still in the future", () => {
    const status = derivePresaleStatus(
      presale({ status: "failed", raised: 2 }),
      new Date("2026-05-11T11:00:00.000Z").getTime(),
    );

    expect(status).toBe("failed");
  });

  it("marks a presale succeeded immediately when the hard cap is filled", () => {
    const status = derivePresaleStatus(
      presale({ status: "live", raised: 20 }),
      new Date("2026-05-11T11:00:00.000Z").getTime(),
    );

    expect(status).toBe("succeeded");
  });
});
