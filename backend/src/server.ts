import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { config } from "./config";
import { router } from "./routes";
import { startIndexer } from "./indexer";
import { prisma } from "./db";

const app = express();
app.set("trust proxy", true);

const allowedOrigins = new Set(
  [config.frontendOrigin, "https://tonpad.org", "https://www.tonpad.org"]
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, "")),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(config.uploadDir));
app.use(router);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error("[api] request failed", err);
  if (err instanceof ZodError) {
    res.status(400).json({ message: "Invalid request", issues: err.issues });
    return;
  }
  res.status(500).json({ message: "Internal server error" });
};
app.use(errorHandler);

console.log("[api] TONPad backend startup");
console.log(`[api] PORT=${config.port}`);
console.log(`[api] HOST=${config.host}`);
console.log(`[api] NETWORK=${config.network}`);
console.log(`[api] FACTORY_ADDRESS=${config.factoryAddress}`);
console.log(`[api] CORS origin=${config.frontendOrigin}`);
console.log(`[api] DATABASE_URL configured=${config.databaseUrl ? "yes" : "no"}`);

async function verifyDatabase() {
  await prisma.$queryRaw`SELECT 1`;
  console.log("[api] database connection success");
  await verifyLaunchSchema();
}

async function verifyLaunchSchema() {
  const requiredColumns = [
    "burnedTokens",
    "presaleTokens",
    "liquidityTokens",
    "creatorTokens",
    "presaleTON",
    "liquidityTON",
    "platformFeeTON",
    "creatorTON",
  ];

  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'Launch'
  `;

  const present = new Set(rows.map((row) => row.column_name));
  const missing = requiredColumns.filter((column) => !present.has(column));

  if (missing.length > 0) {
    console.error("[api] launch schema mismatch detected", {
      missingColumns: missing,
      hint: "Run npm run backend:prisma:migrate before starting the backend.",
    });
    throw new Error(`Launch table missing required columns: ${missing.join(", ")}`);
  }

  console.log("[api] launch schema verified");
}

const server = app.listen(config.port, config.host, () => {
  console.log(`[api] Backend running on ${config.host}:${config.port}`);
  void bootstrap();
});

async function bootstrap() {
  try {
    await verifyDatabase();
    startIndexer();
  } catch (err) {
    console.error("[api] backend bootstrap failed", err);
    server.close();
    await prisma.$disconnect();
    process.exit(1);
  }
}

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
