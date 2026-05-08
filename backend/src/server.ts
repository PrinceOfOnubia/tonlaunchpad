import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { config } from "./config";
import { router } from "./routes";
import { startIndexer } from "./indexer";
import { prisma } from "./db";

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === config.frontendOrigin || origin.startsWith("http://localhost:")) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
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

const server = app.listen(config.port, () => {
  console.log(`[api] TONPad backend listening on :${config.port}`);
  console.log(`[api] CORS frontend origin: ${config.frontendOrigin}`);
  startIndexer();
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
