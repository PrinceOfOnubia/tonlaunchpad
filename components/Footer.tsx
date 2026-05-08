import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-100 bg-white/60">
      <div className="container-page py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-md text-sm text-ink-500">
              Fair and transparent TON presales. Simple token launches, on-chain claims, refunds,
              and creator treasury release.
            </p>
          </div>

          <FooterCol title="Platform" links={[
            { href: "/tokens", label: "Browse tokens" },
            { href: "/create", label: "Launch a token" },
            { href: "/profile", label: "My portfolio" },
          ]} />

          <FooterCol title="Follow us" links={[
            // TODO: replace with your real handles before going live
            { href: "https://twitter.com/tonpad", label: "Twitter / X", external: true },
            { href: "https://t.me/tonpad", label: "Telegram", external: true },
          ]} />
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-ink-100 pt-6 text-xs text-ink-400 sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} TonPad. All rights reserved.</span>
          <span>Built on TON</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}) {
  return (
    <div>
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-700">{title}</div>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            {l.external ? (
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-ink-500 hover:text-ton-600"
              >
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className="text-sm text-ink-500 hover:text-ton-600">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
