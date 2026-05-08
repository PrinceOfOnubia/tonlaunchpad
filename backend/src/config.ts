import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  toncenterEndpoint:
    process.env.TONCENTER_ENDPOINT ?? "https://testnet.toncenter.com/api/v2/jsonRPC",
  toncenterApiKey: process.env.TONCENTER_API_KEY ?? "",
  factoryAddress:
    process.env.FACTORY_ADDRESS ?? "EQCadGgX-fT-oYaR5iyrCPHYTrXWjx1Pmcxj9_E83qoHuwoR",
  dexAdapterAddress:
    process.env.DEX_ADAPTER_ADDRESS ?? "EQAxVYGGW85GzumFpfoXPm6SJmSlxB-n7eNEZDYq4YH5sUcp",
  network: process.env.NETWORK ?? "testnet",
  port: Number(process.env.PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "https://tonlaunchpad.vercel.app",
  publicBaseUrl: (process.env.PUBLIC_UPLOAD_BASE_URL ?? process.env.BACKEND_PUBLIC_URL ?? "").replace(/\/$/, ""),
  uploadDir: process.env.UPLOAD_DIR ?? "backend/uploads",
  indexerEnabled: process.env.INDEXER_ENABLED !== "false",
  indexerIntervalMs: Number(process.env.INDEXER_INTERVAL_MS ?? 30_000),
};
