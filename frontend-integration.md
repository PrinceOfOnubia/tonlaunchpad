# Frontend Integration

The frontend should launch through `LaunchpadFactory`, not by deploying pools directly.

## Factory Launch Message

Send `LaunchToken` to `LaunchpadFactory`.

Fields:

- `name: string`
- `symbol: string`
- `description: string`
- `metadata: Cell` - logo/social metadata encoded off-chain
- `totalSupply: bigint`
- `decimals: bigint`
- `presalePercent: bigint`
- `liquidityPercentTokens: bigint`
- `creatorPercent: bigint`
- `treasuryAddress: Address`
- `dexAdapter: Address`
- `buybackWallet: Address`
- `presaleRate: bigint` - token nano-units per 1 TON
- `softCap: bigint` - nanotons
- `hardCap: bigint` - nanotons
- `minContribution: bigint` - nanotons
- `maxContribution: bigint` - nanotons
- `startTime: bigint` - Unix seconds
- `endTime: bigint` - Unix seconds
- `liquidityPercentOfRaised: bigint` - 0 to 100
- `buybackEnabled: boolean`
- `buybackPercentBps: bigint` - 0 to 4000
- `buybackChunkBps: bigint` - must be `<= buybackPercentBps`
- `buybackIntervalSeconds: bigint`

Frontend conversion for buyback cadence:

```ts
buybackPercentBps = buyback.percent * 100
buybackChunkBps = Math.floor(buybackPercentBps * buyback.rate.percent / 100)
buybackIntervalSeconds = buyback.rate.intervalMinutes * 60
```

## Factory Getters

| Getter | Args | Returns |
| --- | --- | --- |
| `getLaunchCount()` | none | Total launches |
| `getLaunch(id)` | launch id | `{ token, pool, creator }` |

## Pool Messages

| Message | Sender | Value | Purpose |
| --- | --- | --- | --- |
| `Contribute` | User | Contribution amount in TON | Active sale contribution |
| `MigrateLiquidity` | Anyone | Gas | Finalize success and send liquidity to `DexAdapter` |
| `ClaimTokens` | User | Gas | Claim presale token allocation after migration |
| `Refund` | User | Gas | Refund failed/cancelled sale |
| `RecoverFailedTokens` | Creator | Gas | Recover unsold pool tokens after failed/cancelled sale |
| `WithdrawTreasury` | Treasury | Gas | Withdraw raised TON excluding liquidity and buyback reserves |
| `ExecuteBuyback` | Anyone | Gas | Execute scheduled buyback through `DexAdapter` |
| `Pause` | Creator | Gas | Pause contributions |
| `Unpause` | Creator | Gas | Resume contributions |
| `CancelSale` | Creator | Gas | Cancel before migration |

## Pool Getters

| Getter | Args | Returns |
| --- | --- | --- |
| `getConfig()` | none | Pool config including token, treasury, DEX, caps, times, allocations, buyback settings |
| `getState()` | none | `totalRaised`, `totalSold`, `finalized`, `failed`, `cancelled`, `paused`, `migrationDone`, `liquidityTON`, `buybackReserve`, `buybackReleased`, `treasuryWithdrawn` |
| `getContribution(user)` | `Address` | User contribution in nanotons |
| `getClaimed(user)` | `Address` | Whether user has claimed |

## Jetton Getters

| Getter | Args | Returns |
| --- | --- | --- |
| `getWalletAddress(owner)` | `Address` | Deterministic Jetton wallet address for holder/pool/adapter |
| `getJettonData()` | none | TEP-74 style master data: supply, mintable flag, admin, content, wallet code |
| `getTokenMetadata()` | none | Frontend metadata: name, symbol, description, metadata cell, total supply, decimals |

## Jetton Wallet Getters

| Getter | Args | Returns |
| --- | --- | --- |
| `getWalletData()` | none | TEP-74 style wallet data: balance, owner, master, wallet code |

## DEX Adapter

`DexAdapter` is intentionally a DEX stub. It receives TON and real Jettons via its Jetton wallet; production DeDust/STON.fi routing should be implemented behind this adapter boundary.

Messages:

- `AddLiquidity { token, tokenAmount, requester }`
- `ExecuteDexBuyback { token, requester }`

Getter:

- `getDexState()` returns liquidity TON/tokens, buyback TON, migration count, buyback count.

## Frontend State Rules

- Show contribute when sale is active and not paused/cancelled/migrated.
- Show migration when `now > endTime && totalRaised >= softCap`, or hard cap has been reached.
- Show claim only when `migrationDone === true`.
- Show refund when `cancelled || (now > endTime && totalRaised < softCap)`.
- Show treasury withdrawal only when `migrationDone === true`.
- Show buyback execution only when `migrationDone === true` and scheduled buyback TON is available.

## Testnet Deployment

```bash
npm install
npm run build
npx blueprint run deployLaunchpad --testnet
```

Use the deployed `LaunchpadFactory` address as the backend launch target and the deployed `DexAdapter` address as the launch config DEX adapter.
