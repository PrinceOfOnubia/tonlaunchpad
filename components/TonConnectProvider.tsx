"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";

const MANIFEST_URL =
  process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL ?? "https://tonpad.org/tonconnect-manifest.json";

/**
 * Client-side TonConnect provider using the production manifest.
 * Wallet selection and handoff are left entirely to the standard TonConnect UI.
 */
export function TonConnectProvider({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
      {children}
    </TonConnectUIProvider>
  );
}
