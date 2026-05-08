"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { useEffect, useState } from "react";

/**
 * Wallet connection provider.
 *
 * Why this implementation:
 *   - We compute the manifest URL synchronously in `useState` so the provider
 *     mounts immediately with a valid value. Returning `null` while the URL is
 *     being computed (the previous bug) prevented `<TonConnectUIProvider>` from
 *     ever initializing the wallet bridge — which is why "Connect Wallet" did
 *     nothing.
 *   - On the server we use a static placeholder; the wallet doesn't fetch the
 *     manifest during SSR anyway. We swap to `window.location.origin` on mount
 *     if `NEXT_PUBLIC_SITE_URL` isn't set.
 *   - Children always render — there is no `return null` path.
 */
export function TonConnectProvider({ children }: { children: React.ReactNode }) {
  const [manifestUrl, setManifestUrl] = useState<string>(() => {
    const envSite = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL)?.replace(/\/$/, "");
    if (envSite) return `${envSite}/tonconnect-manifest.json`;
    if (typeof window !== "undefined") {
      return `${window.location.origin}/tonconnect-manifest.json`;
    }
    // SSR fallback. Replaced on mount.
    return "https://tonpad.app/tonconnect-manifest.json";
  });

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL) return;
    const correct = `${window.location.origin}/tonconnect-manifest.json`;
    if (correct !== manifestUrl) setManifestUrl(correct);
  }, [manifestUrl]);

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
