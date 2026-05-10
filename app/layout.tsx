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
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://tonlaunchpad.vercel.app",
  ),
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
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
