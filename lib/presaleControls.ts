import { Address, beginCell, toNano } from "@ton/core";
import { TonClient } from "@ton/ton";
import { getTonConnectValidUntil, type LaunchTransaction } from "./tonLaunchpad";

const END_PRESALE_EARLY_OPCODE = 401549937;
const CANCEL_PRESALE_EARLY_OPCODE = 1419680460;

export function buildEndPresaleEarlyTransaction(poolAddress: string): LaunchTransaction {
  return buildPoolAdminTransaction(poolAddress, END_PRESALE_EARLY_OPCODE);
}

export function buildCancelPresaleEarlyTransaction(poolAddress: string): LaunchTransaction {
  return buildPoolAdminTransaction(poolAddress, CANCEL_PRESALE_EARLY_OPCODE);
}

export async function getPresaleFactoryOwner(poolAddress: string): Promise<string> {
  const endpoint = process.env.NEXT_PUBLIC_TONCENTER_ENDPOINT;
  if (!endpoint) throw new Error("NEXT_PUBLIC_TONCENTER_ENDPOINT is not configured.");
  const client = new TonClient({ endpoint });
  const result = await client.runMethod(Address.parse(poolAddress), "getFactoryOwner");
  return formatTonAddress(result.stack.readAddress().toString());
}

export function sameTonAddress(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  try {
    return Address.parse(a).equals(Address.parse(b));
  } catch {
    return false;
  }
}

export function formatTonAddress(value: string) {
  return Address.parse(value).toString({
    bounceable: false,
    testOnly: (process.env.NEXT_PUBLIC_TON_NETWORK || "testnet").toLowerCase() !== "mainnet",
  });
}

function buildPoolAdminTransaction(poolAddress: string, opcode: number): LaunchTransaction {
  const pool = Address.parse(poolAddress);
  const body = beginCell().storeUint(opcode, 32).endCell();
  return {
    to: pool.toString(),
    amountNano: toNano("0.05").toString(),
    payload: bytesToBase64(body.toBoc()),
    validUntil: getTonConnectValidUntil(),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
