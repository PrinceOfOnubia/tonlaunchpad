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

export interface AllocationBreakdown {
  presaleTON: number;
  liquidityTON: number;
  platformFeeTON: number;
  creatorTON: number;
  presaleTokens: number;
  liquidityTokens: number;
  creatorTokens: number;
  presaleTokenFee: number;
  burnedTokens: number;
  liquidityReceiver: "creator" | "liquidity";
}

export interface SocialLinks {
  website?: string;
  twitter?: string;
  telegram?: string;
  youtube?: string;
  tiktok?: string;
  github?: string;
}

// -----------------------------------------------------------------------------
// Token — core entity
// -----------------------------------------------------------------------------
export interface Token {
  id: string;
  /** On-chain TON jetton master address — null until deploy succeeds */
  address: string | null;
  presalePoolAddress?: string | null;
  tokenMasterAddress?: string | null;
  factoryAddress?: string | null;
  txHash?: string | null;
  metadataUrl?: string | null;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  /** Wide cover image displayed on cards & detail header. Optional. */
  bannerUrl?: string | null;

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
  setupState?: "preparing" | "ready";
  allocationBreakdown?: AllocationBreakdown;
  platformFees?: {
    tonTreasury?: string | null;
    tokenTreasury?: string | null;
    liquidityTreasury?: string | null;
    tonFeeBps: number;
    tokenFeeBps: number;
  };
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
  hash?: string | null;
  kind: TxKind;
  amountTon: number;
  amountToken: number;
  /** ISO-8601 */
  timestamp: string;
  wallet: string;
  tokenId: string;
  tokenName?: string;
  tokenSymbol?: string;
  relatedAddress?: string | null;
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
  allocationType?: "wallet" | "projected_creator" | "presale" | "claimable";
}

export interface UserPortfolio {
  wallet: string;
  totalValueTon: number;
  pnlPercent: number;
  holdings: PortfolioHolding[];
}

export interface ProfileLaunchPosition {
  launch: Token;
  amountTon?: number;
  tokenAmount?: number;
  transaction?: Transaction;
}

export interface UserProfile {
  wallet: string;
  createdTokens: Token[];
  createdLaunches?: Token[];
  contributedLaunches?: ProfileLaunchPosition[];
  claimedTokens?: ProfileLaunchPosition[];
  claimableTokens?: ProfileLaunchPosition[];
  creatorAllocations?: PortfolioHolding[];
  contributions: ProfileLaunchPosition[];
  transactions: Transaction[];
  claimable?: ProfileLaunchPosition[];
  refundable?: ProfileLaunchPosition[];
  portfolio: UserPortfolio;
}

// -----------------------------------------------------------------------------
// Create-form payload (POST /api/tokens)
// -----------------------------------------------------------------------------
export interface CreateTokenPayload {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string | null;
  /** Optional wide cover image. Same upload endpoint as logo. */
  bannerUrl?: string | null;
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
