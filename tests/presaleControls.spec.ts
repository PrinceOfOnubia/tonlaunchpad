import { canBurnUnsoldTokens } from "../lib/presaleActionState";

describe("canBurnUnsoldTokens", () => {
  it("allows burning when a successful presale ended below hard cap and has not burned yet", () => {
    expect(
      canBurnUnsoldTokens({
        status: "succeeded",
        raised: 10,
        softCap: 10,
        hardCap: 20,
        burnedTokens: 0,
      }),
    ).toBe(true);
  });

  it("blocks burning after sell-out", () => {
    expect(
      canBurnUnsoldTokens({
        status: "succeeded",
        raised: 20,
        softCap: 10,
        hardCap: 20,
        burnedTokens: 0,
      }),
    ).toBe(false);
  });

  it("blocks burning after tokens were already burned", () => {
    expect(
      canBurnUnsoldTokens({
        status: "succeeded",
        raised: 10,
        softCap: 10,
        hardCap: 20,
        burnedTokens: 5,
      }),
    ).toBe(false);
  });
});
