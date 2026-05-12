import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function stringEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const payload = {
    factoryAddress: stringEnv("NEXT_PUBLIC_FACTORY_ADDRESS"),
    network: stringEnv("NEXT_PUBLIC_TON_NETWORK") ?? "testnet",
    toncenterEndpoint:
      stringEnv("NEXT_PUBLIC_TONCENTER_ENDPOINT") ?? "https://testnet.toncenter.com/api/v2/jsonRPC",
    appUrl: stringEnv("NEXT_PUBLIC_APP_URL") ?? stringEnv("NEXT_PUBLIC_SITE_URL") ?? "https://tonpad.org",
    tonconnectManifestUrl:
      stringEnv("NEXT_PUBLIC_TONCONNECT_MANIFEST_URL") ?? "https://tonpad.org/tonconnect-manifest.json",
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
