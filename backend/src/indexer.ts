import { Address } from "@ton/core";
import { TonClient } from "@ton/ton";
import { config } from "./config";
import { prisma } from "./db";
import { computeStatus } from "./mappers";

export function startIndexer() {
  if (!config.indexerEnabled) {
    console.log("[indexer] disabled");
    return;
  }

  const indexer = new TonpadIndexer();
  void indexer.tick();
  setInterval(() => void indexer.tick(), config.indexerIntervalMs).unref();
}

class TonpadIndexer {
  private running = false;
  private client = new TonClient({
    endpoint: config.toncenterEndpoint,
    apiKey: config.toncenterApiKey || undefined,
  });

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      console.log("[indexer] tick start");
      await this.pollFactory();
      await this.refreshLaunches();
      console.log("[indexer] tick complete");
    } catch (err) {
      console.warn("[indexer] tick failed", err);
    } finally {
      this.running = false;
    }
  }

  private async pollFactory() {
    const factory = Address.parse(config.factoryAddress);
    const countResult = await this.client.runMethod(factory, "getLaunchCount");
    const launchCount = Number(countResult.stack.readBigNumber());
    if (!Number.isFinite(launchCount) || launchCount <= 0) return;

    for (let i = 0; i < launchCount; i += 1) {
      try {
        const result = await this.client.runMethod(factory, "getLaunch", [{ type: "int", value: BigInt(i) }]);
        const tuple = result.stack.readTuple();
        const tokenMasterAddress = tuple.readAddress().toString();
        const presalePoolAddress = tuple.readAddress().toString();
        const creatorWallet = tuple.readAddress().toString();

        const discoveredAt = new Date();
        const existingByPool = await prisma.launch.findUnique({ where: { presalePoolAddress } });
        const optimistic =
          existingByPool ??
          (await prisma.launch.findFirst({
            where: { creatorWallet, presalePoolAddress: null },
            orderBy: { createdAt: "desc" },
          }));

        if (optimistic) {
          await prisma.launch.update({
            where: { id: optimistic.id },
            data: {
              tokenMasterAddress,
              presalePoolAddress,
              creatorWallet,
              factoryAddress: config.factoryAddress,
              pendingIndexing: false,
              lastIndexedAt: discoveredAt,
            },
          });
          console.log("[indexer] reconciled launch", {
            id: optimistic.id,
            presalePoolAddress,
            tokenMasterAddress,
          });
          continue;
        }

        const created = await prisma.launch.create({
          data: {
            tokenName: `TONPad Launch ${i + 1}`,
            symbol: `TON${i + 1}`,
            description: "Launch discovered from the TONPad factory.",
            logoUrl: "https://tonlaunchpad.vercel.app/icon.png",
            creatorWallet,
            factoryAddress: config.factoryAddress,
            tokenMasterAddress,
            presalePoolAddress,
            softCap: 0,
            hardCap: 0,
            liquidityPercent: 0,
            status: "upcoming",
            startTime: new Date(),
            endTime: new Date(Date.now() + 60 * 60 * 1000),
            pendingIndexing: false,
            lastIndexedAt: discoveredAt,
          },
        });
        console.log("[indexer] discovered launch", {
          id: created.id,
          presalePoolAddress,
          tokenMasterAddress,
        });
      } catch (err) {
        console.warn(`[indexer] failed to read factory launch ${i}`, err);
      }
    }
  }

  private async refreshLaunches() {
    const launches = await prisma.launch.findMany();
    await Promise.all(
      launches.map(async (launch) => {
        // Pool getter decoding is contract-version sensitive. For the MVP indexer we
        // preserve frontend-submitted raisedTon and update status from DB fields;
        // contribution/claim/refund tx parsing can advance this without blocking reads.
        const raisedTon = launch.raisedTon;
        const status = computeStatus({ ...launch, raisedTon });
        await prisma.launch.update({
          where: { id: launch.id },
          data: { raisedTon, status, lastIndexedAt: new Date() },
        });
      }),
    );
  }

}
