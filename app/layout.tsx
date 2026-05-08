import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TonConnectProvider } from "@/components/TonConnectProvider";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TonPad — Launch tokens on TON",
  description:
    "Presale-driven launchpad for TON jettons with programmatic buybacks. Zero hidden fees, transparent on-chain.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "TonPad",
    description: "Presale-driven launchpad for TON jettons with programmatic buybacks.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
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
