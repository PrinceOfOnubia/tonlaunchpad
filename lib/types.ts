// =============================================================================
// TonPad — Domain Types
// These match the JSON contracts the backend should return / accept.
// See README.md → "API Contract" for endpoint-by-endpoint shapes.
// =============================================================================

export type PresaleStatus = "upcoming" | "live" | "succeeded" | "failed" | "finalized";

export type TokenListStatus = "all" | "live" | "upcoming" | "succeeded" | "concluded" | "trending";

export type SortBy = "newest" | "marketCap" | "volume24h" | "raised";

// -----------------------------------------------------------------------------
// Presale
// -----------------------------------------------------------------------------
export interface PresaleInfo {
  /** Tokens received per 1 TON contributed */
  rate: number;
  /** Min TON to raise for presale to succeed */
  softCap: number;
  /** Max TON acceptable */
  hardCap: number;
  /** Current TON raised (live, from backend) */
  raised: number;
  contributors: number;
  /** ISO-8601 */
  startTime: string;
  endTime: string;
  status: PresaleStatus;
  /** Optional per-wallet limits (TON) */
  minContribution?: number;
  maxContribution?: number;
}

export interface TokenAllocations {
  presale: number;
  liquidity: number;
  creator: number;
}

export interface SocialLinks {
  website?: string;
  twitter?: string;
  telegram?: string;
}

// -----------------------------------------------------------------------------
// Token — core entity
// -----------------------------------------------------------------------------
export interface Token {
  id: string;
  /** On-chain TON jetton master address — null until deploy succeeds */
  address: string | null;
  presalePoolAddress?: string | null;
  metadataUrl?: string | null;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;

  totalSupply: number;
  decimals: number;
  allocations: TokenAllocations;

  presale: PresaleInfo;
  /** Creator's manual liquidity plan as % of raised TON. Informational only. */
  liquidityPercent: number;

  social: SocialLinks;
  creator: string;
  createdAt: string;

  // Populated after presale finalizes; 0/null during presale.
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  holders: number;
}

// -----------------------------------------------------------------------------
// Charts & transactions
// -----------------------------------------------------------------------------
export interface PricePoint {
  /** Unix ms */
  t: number;
  price: number;
  volume?: number;
}

export type ChartTimeframe = "1H" | "1D" | "1W" | "1M" | "ALL";

export type TxKind = "launch" | "contribute" | "claim" | "refund" | "treasury" | "buy" | "sell";

export interface Transaction {
  id: string;
  hash: string;
  kind: TxKind;
  amountTon: number;
  amountToken: number;
  /** ISO-8601 */
  timestamp: string;
  wallet: string;
  tokenId: string;
}

// -----------------------------------------------------------------------------
// Platform stats
// -----------------------------------------------------------------------------
export interface PlatformStats {
  totalTokens: number;
  totalUsers: number;
  totalVolumeTon: number;
  totalRaisedTon: number;
  note?: string;
}

// -----------------------------------------------------------------------------
// User
// -----------------------------------------------------------------------------
export interface PortfolioHolding {
  tokenId: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  amount: number;
  valueTon: number;
  pnlPercent: number;
}

export interface UserPortfolio {
  wallet: string;
  totalValueTon: number;
  pnlPercent: number;
  holdings: PortfolioHolding[];
}

// -----------------------------------------------------------------------------
// Create-form payload (POST /api/tokens)
// -----------------------------------------------------------------------------
export interface CreateTokenPayload {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  metadataUrl?: string | null;
  totalSupply: number;
  decimals: number;
  allocations: TokenAllocations;
  presale: {
    rate: number;
    softCap: number;
    hardCap: number;
    startTime: string;
    endTime: string;
    minContribution?: number;
    maxContribution?: number;
  };
  liquidityPercent: number;
  social: SocialLinks;
  /** Connected wallet — set automatically before submit */
  creator: string;
}

// -----------------------------------------------------------------------------
// Listing
// -----------------------------------------------------------------------------
export interface TokenListParams {
  status?: TokenListStatus;
  search?: string;
  sortBy?: SortBy;
  page?: number;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
