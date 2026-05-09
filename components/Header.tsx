"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TonConnectButton } from "@tonconnect/ui-react";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "./Logo";
import { WalletConnectionActions } from "./WalletConnectionActions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/tokens", label: "Tokens" },
  { href: "/create", label: "Create" },
  { href: "/profile", label: "Profile" },
];

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/40 bg-white/70 backdrop-blur-lg">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-ton-50 text-ton-700" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <TonConnectButton />
          </div>
          <div className="hidden lg:block">
            <WalletConnectionActions compact />
          </div>
          <button
            type="button"
            className="rounded-lg bg-white p-2 ring-1 ring-ink-200 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-100 bg-white md:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  pathname === n.href
                    ? "bg-ton-50 text-ton-700"
                    : "text-ink-700 hover:bg-ink-50",
                )}
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-2">
              <TonConnectButton />
            </div>
            <WalletConnectionActions compact />
          </div>
        </div>
      )}
    </header>
  );
}
