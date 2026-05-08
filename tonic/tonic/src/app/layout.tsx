import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tonic | Launch memes on TON",
  description: "Create a token, start the bonding curve, and let the market sip."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
