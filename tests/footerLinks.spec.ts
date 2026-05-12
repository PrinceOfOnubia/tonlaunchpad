import { FOOTER_FOLLOW_LINKS } from "../lib/footerLinks";

describe("footer follow links", () => {
  it("points Twitter / X and Telegram to the live TonPad accounts", () => {
    expect(FOOTER_FOLLOW_LINKS).toEqual([
      { href: "https://x.com/TonPad_org", label: "Twitter / X", external: true },
      { href: "https://t.me/TonPad_org", label: "Telegram", external: true },
    ]);
  });
});
