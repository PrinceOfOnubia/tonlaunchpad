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
      await this.pollFactory();
      await this.refreshLaunches();
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

        await prisma.launch.upsert({
          where: { presalePoolAddress },
          create: {
            tokenName: `Indexed Token ${i + 1}`,
            symbol: `TON${i + 1}`,
            description: "Indexed from LaunchpadFactory. Metadata reconciliation pending.",
            logoUrl: "https://tonlaunchpad.vercel.app/icon.png",
            creatorWallet,
            factoryAddress: config.factoryAddress,
            tokenMasterAddress,
            presalePoolAddress,
            dexAdapterAddress: config.dexAdapterAddress,
            softCap: 0,
            hardCap: 0,
            liquidityPercent: 0,
            status: "upcoming",
            startTime: new Date(),
            endTime: new Date(Date.now() + 60 * 60 * 1000),
            lastIndexedAt: new Date(),
          },
          update: {
            tokenMasterAddress,
            creatorWallet,
            factoryAddress: config.factoryAddress,
            dexAdapterAddress: config.dexAdapterAddress,
            lastIndexedAt: new Date(),
          },
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
