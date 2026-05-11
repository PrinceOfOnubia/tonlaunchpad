import { gunzipSync, gzipSync } from "node:zlib";

type MetadataSocials = {
  website?: string;
  twitter?: string;
  telegram?: string;
  youtube?: string;
  tiktok?: string;
  github?: string;
};

export type PublishedTokenMetadata = {
  name: string;
  symbol: string;
  description: string;
  decimals: string;
  image: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  youtube?: string;
  tiktok?: string;
  github?: string;
};

type EncodedMetadataPayload = {
  n: string;
  s: string;
  d: string;
  dc: string;
  i: string;
  w?: string;
  tw?: string;
  tg?: string;
  yt?: string;
  tt?: string;
  gh?: string;
  t: number;
};

const DEFAULT_IMAGE_URL = "https://tonpad.org/icon.png";
const DEFAULT_APP_URL = "https://tonpad.org";

export function buildMetadataId(input: {
  name: string;
  symbol: string;
  description: string;
  decimals: number | string;
  imageUrl?: string | null;
  socials?: MetadataSocials;
}) {
  const payload: EncodedMetadataPayload = {
    n: sanitizeText(input.name, 64, "TONPad Token"),
    s: sanitizeText(input.symbol, 16, "TKN").toUpperCase(),
    d: sanitizeText(input.description, 1000, ""),
    dc: String(normalizeDecimals(input.decimals)),
    i: normalizeImageUrl(input.imageUrl),
    w: sanitizeOptionalUrl(input.socials?.website),
    tw: sanitizeOptionalText(input.socials?.twitter, 64),
    tg: sanitizeOptionalText(input.socials?.telegram, 128),
    yt: sanitizeOptionalUrl(input.socials?.youtube),
    tt: sanitizeOptionalUrl(input.socials?.tiktok),
    gh: sanitizeOptionalUrl(input.socials?.github),
    t: Date.now(),
  };

  return gzipSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64url");
}

export function decodeMetadataId(id: string): PublishedTokenMetadata {
  const json = gunzipSync(Buffer.from(id, "base64url")).toString("utf8");
  const payload = JSON.parse(json) as Partial<EncodedMetadataPayload>;

  return {
    name: sanitizeText(payload.n, 64, "TONPad Token"),
    symbol: sanitizeText(payload.s, 16, "TKN").toUpperCase(),
    description: sanitizeText(payload.d, 1000, ""),
    decimals: String(normalizeDecimals(payload.dc)),
    image: normalizeImageUrl(payload.i),
    website: sanitizeOptionalUrl(payload.w),
    twitter: sanitizeOptionalText(payload.tw, 64),
    telegram: sanitizeOptionalText(payload.tg, 128),
    youtube: sanitizeOptionalUrl(payload.yt),
    tiktok: sanitizeOptionalUrl(payload.tt),
    github: sanitizeOptionalUrl(payload.gh),
  };
}

export function buildMetadataUrl(id: string) {
  return `${getPublicAppUrl()}/api/metadata/${id}`;
}

export function getPublicAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    DEFAULT_APP_URL
  ).replace(/\/$/, "");
}

function normalizeImageUrl(value?: string | null) {
  const url = sanitizeOptionalUrl(value);
  return url ?? DEFAULT_IMAGE_URL;
}

function normalizeDecimals(value: number | string | undefined) {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isInteger(num) || num! < 0 || num! > 18) return 9;
  return num!;
}

function sanitizeText(value: unknown, max: number, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

function sanitizeOptionalText(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function sanitizeOptionalUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
