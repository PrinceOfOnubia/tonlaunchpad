const network = (process.env.NEXT_PUBLIC_TON_NETWORK ?? "").toLowerCase();

export function tonviewerBaseUrl() {
  return network === "mainnet" ? "https://tonviewer.com" : "https://testnet.tonviewer.com";
}

export function isExplorerSafeTxHash(value: string | null | undefined) {
  if (!value) return false;
  return !(
    value.startsWith("te6") ||
    value.startsWith("contribution-") ||
    value.length > 160
  );
}

export function tonviewerTransactionUrl(txHash: string) {
  return `${tonviewerBaseUrl()}/transaction/${encodeURIComponent(txHash)}`;
}

export function tonviewerAddressUrl(address: string) {
  return `${tonviewerBaseUrl()}/${encodeURIComponent(address)}`;
}

export function tonviewerUrl({
  txHash,
  address,
}: {
  txHash?: string | null;
  address?: string | null;
}) {
  if (txHash && isExplorerSafeTxHash(txHash)) return tonviewerTransactionUrl(txHash);
  if (address) return tonviewerAddressUrl(address);
  return tonviewerBaseUrl();
}
