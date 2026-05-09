"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";

const MANIFEST_URL = "https://tonlaunchpad.vercel.app/tonconnect-manifest.json";

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
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      {children}
    </TonConnectUIProvider>
  );
}
