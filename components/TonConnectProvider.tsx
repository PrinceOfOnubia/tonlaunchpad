"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";
import { useEffect, useState } from "react";

export function TonConnectProvider({ children }: { children: React.ReactNode }) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);

  useEffect(() => {
    // Prefer NEXT_PUBLIC_SITE_URL when set; fall back to window.location.origin in dev.
    const base =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? window.location.origin;
    setManifestUrl(`${base}/tonconnect-manifest.json`);
  }, []);

  if (!manifestUrl) {
    // Wait until the client computes the manifest URL before rendering TonConnect consumers.
    return null;
  }

  return <TonConnectUIProvider manifestUrl={manifestUrl}>{children}</TonConnectUIProvider>;
}
