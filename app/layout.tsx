import type { Metadata } from "next";
import "./globals.css";
import { TonConnectProvider } from "@/components/TonConnectProvider";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "TonPad — Launch tokens on TON",
  description:
    "Fair and transparent TON presales with simple on-chain claims, refunds, and creator treasury release.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://tonpad.org",
  ),
  openGraph: {
    title: "TonPad",
    description: "Fair and transparent TON presales.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <TonConnectProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </TonConnectProvider>
      </body>
    </html>
  );
}
