import type { TonConnectUI } from "@tonconnect/ui";

export async function resetTonConnectSession(tonConnectUI: TonConnectUI) {
  try {
    if (tonConnectUI.connected) {
      await tonConnectUI.disconnect();
    }
  } finally {
    clearTonConnectStorage();
  }
}

export function clearTonConnectStorage() {
  if (typeof window === "undefined") return;
  clearStorage(window.localStorage);
  clearStorage(window.sessionStorage);
}

function clearStorage(storage: Storage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => !!key)
    .filter(isTonConnectStorageKey);

  for (const key of keys) {
    storage.removeItem(key);
  }
}

function isTonConnectStorageKey(key: string) {
  const normalized = key.toLowerCase();
  return normalized.includes("ton-connect") || normalized.includes("tonconnect");
}
