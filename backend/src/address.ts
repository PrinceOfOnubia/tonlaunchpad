import { Address } from "@ton/core";

export function addressVariants(value: string | null | undefined): string[] {
  if (!value) return [];
  const variants = new Set<string>([value]);
  try {
    const address = Address.parse(value);
    variants.add(address.toString());
    variants.add(address.toString({ bounceable: false }));
    variants.add(address.toRawString());
  } catch {
    // Keep the original value for non-address ids/hashes handled by callers.
  }
  return [...variants];
}

export function canonicalAddress(value: string): string {
  return Address.parse(value).toString();
}
