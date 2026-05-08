import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  toncenterEndpoint:
    process.env.TONCENTER_ENDPOINT ?? "https://testnet.toncenter.com/api/v2/jsonRPC",
  toncenterApiKey: process.env.TONCENTER_API_KEY ?? "",
  factoryAddress:
    process.env.FACTORY_ADDRESS ?? "EQARP90pfupm_ob9jlKzxqiq0eM1iGAHJep40a3cvxzy8YrL",
  network: process.env.NETWORK ?? "testnet",
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  frontendOrigin: process.env.CORS_ORIGIN ?? process.env.FRONTEND_ORIGIN ?? "https://tonlaunchpad.vercel.app",
  publicBaseUrl: (process.env.PUBLIC_UPLOAD_BASE_URL ?? process.env.BACKEND_PUBLIC_URL ?? "").replace(/\/$/, ""),
  uploadDir: process.env.UPLOAD_DIR ?? "backend/uploads",
  indexerEnabled: process.env.INDEXER_ENABLED !== "false",
  indexerIntervalMs: Number(process.env.INDEXER_INTERVAL_MS ?? 5_000),
};
