import {
  buildMetadataId,
  buildMetadataUrl,
  decodeMetadataId,
} from "../lib/server/tokenMetadata";

describe("TONPad metadata publishing", () => {
  it("creates token-specific HTTPS metadata URLs and decodes valid TEP-64 payloads", () => {
    const id = buildMetadataId({
      name: "Aqua Pad",
      symbol: "AQUA",
      description: "Frontend launch flow token",
      decimals: 9,
      imageUrl: "https://tonpad.org/icon.png",
      socials: {
        website: "https://tonpad.org",
        twitter: "@aqua",
      },
    });

    const metadataUrl = buildMetadataUrl(id);
    const metadata = decodeMetadataId(id);

    expect(metadataUrl.startsWith("https://")).toBe(true);
    expect(metadataUrl).toContain("/api/metadata/");
    expect(metadata.name).toBe("Aqua Pad");
    expect(metadata.symbol).toBe("AQUA");
    expect(metadata.description).toBe("Frontend launch flow token");
    expect(metadata.decimals).toBe("9");
    expect(metadata.image).toBe("https://tonpad.org/icon.png");
    expect(metadata.website).toBe("https://tonpad.org/");
    expect(metadata.twitter).toBe("@aqua");
  });

  it("falls back to the stable tonpad icon when image is missing or not HTTPS", () => {
    const id = buildMetadataId({
      name: "Zenith",
      symbol: "ZNTH",
      description: "",
      decimals: 9,
      imageUrl: "http://invalid.example/logo.png",
    });

    const metadata = decodeMetadataId(id);
    expect(metadata.image).toBe("https://tonpad.org/icon.png");
  });
});
