export interface PublicRuntimeConfig {
  factoryAddress: string | null;
  network: string;
  toncenterEndpoint: string;
  appUrl: string;
  tonconnectManifestUrl: string;
}

const STORAGE_KEY = "tonpad_public_runtime_config";

let cachedConfig: PublicRuntimeConfig | null = null;

function fallbackConfig(): PublicRuntimeConfig {
  return {
    factoryAddress: normalizeString(process.env.NEXT_PUBLIC_FACTORY_ADDRESS),
    network: normalizeString(process.env.NEXT_PUBLIC_TON_NETWORK) ?? "testnet",
    toncenterEndpoint:
      normalizeString(process.env.NEXT_PUBLIC_TONCENTER_ENDPOINT) ??
      "https://testnet.toncenter.com/api/v2/jsonRPC",
    appUrl:
      normalizeString(process.env.NEXT_PUBLIC_APP_URL) ??
      normalizeString(process.env.NEXT_PUBLIC_SITE_URL) ??
      "https://tonpad.org",
    tonconnectManifestUrl:
      normalizeString(process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL) ??
      "https://tonpad.org/tonconnect-manifest.json",
  };
}

function normalizeConfig(input: Partial<PublicRuntimeConfig> | null | undefined): PublicRuntimeConfig {
  const fallback = fallbackConfig();
  return {
    factoryAddress: normalizeString(input?.factoryAddress) ?? fallback.factoryAddress,
    network: normalizeString(input?.network) ?? fallback.network,
    toncenterEndpoint: normalizeString(input?.toncenterEndpoint) ?? fallback.toncenterEndpoint,
    appUrl: normalizeString(input?.appUrl) ?? fallback.appUrl,
    tonconnectManifestUrl:
      normalizeString(input?.tonconnectManifestUrl) ?? fallback.tonconnectManifestUrl,
  };
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStoredConfig(): PublicRuntimeConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeConfig(JSON.parse(raw) as Partial<PublicRuntimeConfig>);
  } catch {
    return null;
  }
}

function writeStoredConfig(config: PublicRuntimeConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage failures
  }
}

export function getCachedRuntimeConfig(): PublicRuntimeConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = readStoredConfig() ?? fallbackConfig();
  return cachedConfig;
}

export function getCachedFactoryAddress(): string | null {
  return getCachedRuntimeConfig().factoryAddress;
}

export async function loadRuntimeConfig(): Promise<PublicRuntimeConfig> {
  try {
    const response = await fetch("/api/runtime-config", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(`Runtime config request failed: ${response.status}`);
    }

    const payload = (await response.json()) as Partial<PublicRuntimeConfig>;
    cachedConfig = normalizeConfig(payload);
    writeStoredConfig(cachedConfig);
    return cachedConfig;
  } catch (error) {
    console.warn("Runtime config unavailable; falling back to bundled env values.", error);
    cachedConfig = readStoredConfig() ?? fallbackConfig();
    return cachedConfig;
  }
}

export function setCachedRuntimeConfig(config: Partial<PublicRuntimeConfig>) {
  cachedConfig = normalizeConfig(config);
  writeStoredConfig(cachedConfig);
  return cachedConfig;
}
