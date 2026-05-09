import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  toncenterEndpoint:
    process.env.TONCENTER_ENDPOINT ?? "https://testnet.toncenter.com/api/v2/jsonRPC",
  toncenterApiKey: process.env.TONCENTER_API_KEY ?? "",
  factoryAddress: process.env.FACTORY_ADDRESS ?? "",
  platformTonTreasury: process.env.PLATFORM_TON_TREASURY ?? "",
  platformTokenTreasury: process.env.PLATFORM_TOKEN_TREASURY ?? "",
  platformTonFeeBps: Number(process.env.PLATFORM_TON_FEE_BPS ?? 500),
  platformTokenFeeBps: Number(process.env.PLATFORM_TOKEN_FEE_BPS ?? 100),
  network: process.env.NETWORK ?? "testnet",
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  frontendOrigin: process.env.CORS_ORIGIN ?? process.env.FRONTEND_ORIGIN ?? "https://tonlaunchpad.vercel.app",
  publicBaseUrl: (
    process.env.PUBLIC_UPLOAD_BASE_URL ??
    process.env.BACKEND_PUBLIC_URL ??
    "https://tonlaunchpad-production.up.railway.app"
  ).replace(/\/$/, ""),
  uploadDir: process.env.UPLOAD_DIR ?? "backend/uploads",
  indexerEnabled: process.env.INDEXER_ENABLED !== "false",
  indexerIntervalMs: Number(process.env.INDEXER_INTERVAL_MS ?? 5_000),
};
