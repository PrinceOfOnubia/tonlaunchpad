import "dotenv/config";
import { Address } from "@ton/core";

function normalizeAddress(value: string | undefined) {
  if (!value) return "";
  try {
    return Address.parse(value).toString();
  } catch {
    return value;
  }
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  toncenterEndpoint:
    process.env.TONCENTER_ENDPOINT ?? "https://testnet.toncenter.com/api/v2/jsonRPC",
  toncenterApiKey: process.env.TONCENTER_API_KEY ?? "",
  factoryAddress: normalizeAddress(process.env.FACTORY_ADDRESS),
  platformTonTreasury: normalizeAddress(process.env.PLATFORM_TON_TREASURY),
  platformTokenTreasury: normalizeAddress(process.env.PLATFORM_TOKEN_TREASURY),
  liquidityTreasury: normalizeAddress(process.env.LIQUIDITY_TREASURY),
  platformTonFeeBps: Number(process.env.PLATFORM_TON_FEE_BPS ?? 500),
  platformTokenFeeBps: Number(process.env.PLATFORM_TOKEN_FEE_BPS ?? 100),
  network: process.env.NETWORK ?? "testnet",
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  frontendOrigin: process.env.CORS_ORIGIN ?? process.env.FRONTEND_ORIGIN ?? "https://tonpad.org",
  publicBaseUrl: (
    process.env.PUBLIC_UPLOAD_BASE_URL ??
    process.env.BACKEND_PUBLIC_URL ??
    "https://tonlaunchpad-production.up.railway.app"
  ).replace(/\/$/, ""),
  uploadDir: process.env.UPLOAD_DIR ?? "backend/uploads",
  indexerEnabled: process.env.INDEXER_ENABLED !== "false",
  indexerIntervalMs: Number(process.env.INDEXER_INTERVAL_MS ?? 8_000),
  indexerFastPollLimit: Number(process.env.INDEXER_FAST_POLL_LIMIT ?? 10),
  indexerFullPollLimit: Number(process.env.INDEXER_FULL_POLL_LIMIT ?? 50),
  indexerRefreshLimit: Number(process.env.INDEXER_REFRESH_LIMIT ?? 10),
};
