"use client";

import { useState } from "react";

export function ContractCopyButton({ contract }: { contract: string }) {
  const [copied, setCopied] = useState(false);

  async function copyContract() {
    await navigator.clipboard.writeText(contract);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      onClick={copyContract}
      className="h-10 rounded-md border border-[#0098ea]/15 bg-white/[0.04] px-3 text-xs font-bold text-[#d7f2ff] transition hover:border-[#0098ea]/50"
    >
      {copied ? "Copied" : "Copy contract"}
    </button>
  );
}
