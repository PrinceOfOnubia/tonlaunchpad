import { Address, beginCell, Builder, toNano } from "@ton/core";
import type { CreateTokenPayload } from "./types";

export interface LaunchTransaction {
  to: string;
  amountNano: string;
  payload: string;
  validUntil: number;
}

const LAUNCH_TOKEN_OPCODE = 1954225128;
const CONTRIBUTE_OPCODE = 443500403;
const LAUNCH_VALUE_TON = "1";
export const DEFAULT_TOKEN_IMAGE_URL = "https://tonlaunchpad.vercel.app/icon.png";

export function buildLaunchTokenTransaction(
  form: CreateTokenPayload,
  creatorWallet: string,
): LaunchTransaction {
  const factoryAddress = requiredAddress(
    process.env.NEXT_PUBLIC_FACTORY_ADDRESS,
    "NEXT_PUBLIC_FACTORY_ADDRESS",
  );
  const dexAdapterAddress = requiredAddress(
    process.env.NEXT_PUBLIC_DEX_ADAPTER_ADDRESS,
    "NEXT_PUBLIC_DEX_ADAPTER_ADDRESS",
  );
  const creatorAddress = requiredAddress(creatorWallet, "connected wallet address");
  const config = normalizeLaunchConfig(form);

  const metadata = buildOffchainMetadataCell(config.metadataUrl);

  const body = beginCell()
    .store((builder) => {
      const b0 = builder;
      b0.storeUint(LAUNCH_TOKEN_OPCODE, 32);
      b0.storeStringRefTail(config.name);
      b0.storeStringRefTail(config.symbol);

      const b1 = new Builder();
      b1.storeStringRefTail(config.description);
      b1.storeRef(metadata);
      b1.storeInt(config.totalSupply, 257);
      b1.storeInt(BigInt(config.decimals), 257);
      b1.storeInt(BigInt(config.allocations.presale), 257);

      const b2 = new Builder();
      b2.storeInt(BigInt(config.allocations.liquidity), 257);
      b2.storeInt(BigInt(config.allocations.creator), 257);
      b2.storeAddress(creatorAddress);

      const b3 = new Builder();
      b3.storeAddress(dexAdapterAddress);
      b3.storeAddress(creatorAddress);
      b3.storeInt(config.presaleRate, 257);

      const b4 = new Builder();
      b4.storeInt(config.softCap, 257);
      b4.storeInt(config.hardCap, 257);
      b4.storeInt(config.minContribution, 257);

      const b5 = new Builder();
      b5.storeInt(config.maxContribution, 257);
      b5.storeInt(BigInt(config.startTime), 257);
      b5.storeInt(BigInt(config.endTime), 257);

      const b6 = new Builder();
      b6.storeInt(BigInt(config.liquidityPercentOfRaised), 257);
      b6.storeBit(config.buybackEnabled);
      b6.storeInt(BigInt(config.buybackPercentBps), 257);
      b6.storeInt(BigInt(config.buybackChunkBps), 257);

      const b7 = new Builder();
      b7.storeInt(BigInt(config.buybackIntervalSeconds), 257);

      b6.storeRef(b7.endCell());
      b5.storeRef(b6.endCell());
      b4.storeRef(b5.endCell());
      b3.storeRef(b4.endCell());
      b2.storeRef(b3.endCell());
      b1.storeRef(b2.endCell());
      b0.storeRef(b1.endCell());
    })
    .endCell();

  return {
    to: factoryAddress.toString(),
    amountNano: toNano(LAUNCH_VALUE_TON).toString(),
    payload: bytesToBase64(body.toBoc()),
    validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
  };
}

export function buildContributeTransaction(poolAddress: string, amountTon: number): LaunchTransaction {
  const pool = requiredAddress(poolAddress, "presale pool address");
  if (!Number.isFinite(amountTon) || amountTon <= 0) {
    throw new Error("Enter a valid TON amount.");
  }
  const body = beginCell().storeUint(CONTRIBUTE_OPCODE, 32).endCell();
  return {
    to: pool.toString(),
    amountNano: toNano(amountTon.toString()).toString(),
    payload: bytesToBase64(body.toBoc()),
    validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
  };
}

export function getLaunchValidationError(form: CreateTokenPayload): string | null {
  try {
    normalizeLaunchConfig(form);
    requiredAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS, "NEXT_PUBLIC_FACTORY_ADDRESS");
    requiredAddress(process.env.NEXT_PUBLIC_DEX_ADAPTER_ADDRESS, "NEXT_PUBLIC_DEX_ADAPTER_ADDRESS");
    return null;
  } catch (err) {
    return errorMessage(err);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Transaction rejected or failed.";
}

export function normalizeTonConnectError(err: unknown): string {
  const raw = errorMessage(err);
  const text = raw.toLowerCase();

  if (
    text.includes("reject") ||
    text.includes("decline") ||
    text.includes("cancel") ||
    text.includes("user denied") ||
    text.includes("user rejected")
  ) {
    return "Transaction declined by user.";
  }

  if (
    text.includes("insufficient") ||
    text.includes("not enough") ||
    text.includes("balance") ||
    text.includes("gas")
  ) {
    return "Insufficient testnet TON for gas.";
  }

  if (text.includes("wallet") && (text.includes("connect") || text.includes("not connected"))) {
    return "Please connect your wallet first.";
  }

  return "Transaction failed. Please check your balance, network, and try again.";
}

function normalizeLaunchConfig(form: CreateTokenPayload) {
  const name = form.name.trim();
  const symbol = form.symbol.trim().toUpperCase();
  const description = form.description.trim();
  const decimals = integerInRange(form.decimals, "Decimals", 0, 18);
  const totalSupply = positiveNumber(form.totalSupply, "Total supply");
  const presaleRate = positiveNumber(form.presale.rate, "Presale rate");
  const softCap = positiveNumber(form.presale.softCap, "Soft cap");
  const hardCap = positiveNumber(form.presale.hardCap, "Hard cap");
  const minContribution = nonNegativeNumber(form.presale.minContribution ?? 0, "Min contribution");
  const maxContribution = positiveNumber(form.presale.maxContribution ?? hardCap, "Max contribution");
  const startTime = unixSeconds(form.presale.startTime, "Start time");
  const endTime = unixSeconds(form.presale.endTime, "End time");
  const buybackPercentBps = Math.round(nonNegativeNumber(form.buyback.percent, "Buyback percent") * 100);
  const buybackChunkBps = Math.round(nonNegativeNumber(form.buyback.rate.percent, "Buyback chunk") * 100);

  if (!name) throw new Error("Token name is required.");
  if (symbol.length < 2 || symbol.length > 10) {
    throw new Error("Symbol must be 2-10 characters.");
  }
  if (form.allocations.presale + form.allocations.liquidity + form.allocations.creator !== 100) {
    throw new Error("Token allocations must sum to exactly 100%.");
  }
  if (hardCap < softCap) throw new Error("Hard cap must be greater than or equal to soft cap.");
  if (minContribution > maxContribution) {
    throw new Error("Min contribution must be less than or equal to max contribution.");
  }
  if (endTime <= startTime) throw new Error("End time must be after start time.");
  if (form.liquidityPercent < 0 || form.liquidityPercent > 100) {
    throw new Error("Liquidity percent of raised TON must be between 0 and 100.");
  }
  const buybackEnabled = form.buyback.enabled && buybackPercentBps > 0;
  if (buybackPercentBps > 4000) throw new Error("Buyback percent must be 0-40%.");
  if (buybackEnabled && buybackChunkBps > buybackPercentBps) {
    throw new Error("Buyback chunk cannot be larger than the total buyback budget.");
  }
  if (form.buyback.rate.intervalMinutes < 1) {
    throw new Error("Buyback interval must be at least 1 minute.");
  }

  return {
    name,
    symbol,
    description,
    imageUrl: form.imageUrl ?? DEFAULT_TOKEN_IMAGE_URL,
    metadataUrl: form.metadataUrl ?? buildDataMetadataUrl({
      name,
      symbol,
      description,
      decimals,
      image: form.imageUrl ?? DEFAULT_TOKEN_IMAGE_URL,
    }),
    social: form.social,
    decimals,
    totalSupply: toTokenUnits(totalSupply, decimals),
    allocations: {
      presale: integerInRange(form.allocations.presale, "Presale allocation", 0, 100),
      liquidity: integerInRange(form.allocations.liquidity, "Liquidity allocation", 0, 100),
      creator: integerInRange(form.allocations.creator, "Creator allocation", 0, 100),
    },
    presaleRate: toTokenUnits(presaleRate, decimals),
    softCap: toNano(softCap.toString()),
    hardCap: toNano(hardCap.toString()),
    minContribution: toNano(minContribution.toString()),
    maxContribution: toNano(maxContribution.toString()),
    startTime,
    endTime,
    liquidityPercentOfRaised: integerInRange(form.liquidityPercent, "Liquidity percent", 0, 100),
    buybackEnabled,
    buybackPercentBps: buybackEnabled ? buybackPercentBps : 0,
    buybackChunkBps: buybackEnabled ? buybackChunkBps : 0,
    buybackIntervalSeconds: Math.round(
      positiveNumber(form.buyback.rate.intervalMinutes, "Buyback interval") * 60,
    ),
  };
}

function buildOffchainMetadataCell(url: string) {
  return beginCell().storeUint(1, 8).storeStringTail(url).endCell();
}

function buildDataMetadataUrl(metadata: {
  name: string;
  symbol: string;
  description: string;
  decimals: number;
  image: string;
}): string {
  const json = JSON.stringify(metadata);
  return `data:application/json,${encodeURIComponent(json)}`;
}

function requiredAddress(value: string | undefined, label: string): Address {
  if (!value?.trim()) throw new Error(`${label} is not configured.`);
  try {
    return Address.parse(value);
  } catch {
    throw new Error(`${label} is not a valid TON address.`);
  }
}

function unixSeconds(value: string, label: string): number {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error(`${label} is invalid.`);
  return Math.floor(ms / 1000);
}

function positiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than 0.`);
  return value;
}

function nonNegativeNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} cannot be negative.`);
  return value;
}

function integerInRange(value: number, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function toTokenUnits(value: number, decimals: number): bigint {
  const [whole, fraction = ""] = value.toString().split(".");
  const normalizedFraction = fraction.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(normalizedFraction || "0");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
