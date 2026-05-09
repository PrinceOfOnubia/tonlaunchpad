import { Address } from "@ton/core";
import { z } from "zod";

export function isTonAddress(value: string): boolean {
  try {
    Address.parse(value);
    return true;
  } catch {
    return false;
  }
}

export const tonAddressSchema = z
  .string()
  .min(1)
  .refine(isTonAddress, "Invalid TON address");

export const socialSchema = z
  .object({
    website: z.string().optional(),
    twitter: z.string().optional(),
    telegram: z.string().optional(),
  })
  .partial()
  .default({});

export const createLaunchSchema = z.object({
  name: z.string().min(1).max(64),
  symbol: z.string().min(1).max(16),
  description: z.string().max(1000).optional().default(""),
  imageUrl: z.string().url().nullable().optional(),
  metadataUrl: z.string().url().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  creator: tonAddressSchema.optional(),
  creatorWallet: tonAddressSchema.optional(),
  factoryAddress: tonAddressSchema.optional(),
  tokenMasterAddress: tonAddressSchema.optional().nullable(),
  presalePoolAddress: tonAddressSchema.optional().nullable(),
  platformTonTreasury: tonAddressSchema.optional().nullable(),
  platformTokenTreasury: tonAddressSchema.optional().nullable(),
  platformTonFeeBps: z.coerce.number().int().min(0).max(500).optional(),
  platformTokenFeeBps: z.coerce.number().int().min(0).max(100).optional(),
  txHash: z.string().min(1).optional(),
  transactionBoc: z.string().optional(),
  totalSupply: z.coerce.number().nonnegative().default(0),
  decimals: z.coerce.number().int().min(0).max(18).default(9),
  allocations: z
    .object({
      presale: z.coerce.number().min(0).max(100),
      liquidity: z.coerce.number().min(0).max(100),
      creator: z.coerce.number().min(0).max(100),
    })
    .refine((v) => v.presale + v.liquidity + v.creator === 100, {
      message: "Allocations must sum to 100",
    }),
  presale: z.object({
    rate: z.coerce.number().nonnegative().default(0),
    softCap: z.coerce.number().nonnegative(),
    hardCap: z.coerce.number().nonnegative(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    minContribution: z.coerce.number().nonnegative().optional(),
    maxContribution: z.coerce.number().nonnegative().optional(),
  }),
  liquidityPercent: z.coerce.number().min(0).max(100),
  social: socialSchema,
});

export const listQuerySchema = z.object({
  status: z.enum(["all", "live", "upcoming", "trending", "succeeded", "concluded"]).optional().default("all"),
  search: z.string().optional().default(""),
  sort: z.enum(["newest", "oldest", "volume"]).optional(),
  sortBy: z.enum(["newest", "oldest", "volume", "marketCap", "volume24h", "raised"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
});
