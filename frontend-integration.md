# Frontend Integration

TONPad uses a classic manual-liquidity presale flow. The frontend launches through `LaunchpadFactory`; it never deploys pools directly.

## Factory Launch Message

Send `LaunchToken` to `LaunchpadFactory`.

Fields:

- `name: string`
- `symbol: string`
- `description: string`
- `metadata: Cell` - TEP-64 off-chain metadata cell
- `totalSupply: bigint`
- `decimals: bigint`
- `presalePercent: bigint`
- `liquidityPercentTokens: bigint` - creator-managed liquidity allocation
- `creatorPercent: bigint`
- `treasuryAddress: Address` - creator treasury receiver
- `presaleRate: bigint` - token nano-units per 1 TON
- `softCap: bigint` - nanotons
- `hardCap: bigint` - nanotons
- `minContribution: bigint` - nanotons
- `maxContribution: bigint` - nanotons
- `startTime: bigint` - Unix seconds
- `endTime: bigint` - Unix seconds
- `liquidityPercentOfRaised: bigint` - informational manual-liquidity plan, 0 to 100

Frontend must show this notice before wallet approval:

> Platform fee: 5% of raised TON.

## Factory Getters

| Getter | Args | Returns |
| --- | --- | --- |
| `getLaunchCount()` | none | Total launches |
| `getLaunch(id)` | launch id | `{ token, pool, creator }` |

## Pool Messages

| Message | Sender | Value | Purpose |
| --- | --- | --- | --- |
| `Contribute` | User | Contribution amount in TON | Active sale contribution |
| `ClaimTokens` | User | Gas | Claim buyer token allocation after successful sale |
| `Refund` | User | Gas | Refund failed or cancelled sale |
| `CreatorClaimTreasury` | Creator or treasury | Gas | Claim creator TON treasury after success |
| `WithdrawTreasury` | Creator or treasury | Gas | Compatibility alias for creator treasury claim |
| `RecoverFailedTokens` | Creator | Gas | Recover unsold buyer tokens after failed/cancelled sale |
| `Pause` | Creator | Gas | Pause contributions |
| `Unpause` | Creator | Gas | Resume contributions |
| `CancelSale` | Creator | Gas | Cancel before finalization |

## Pool Getters

| Getter | Args | Returns |
| --- | --- | --- |
| `getConfig()` | none | Factory, creator, token, treasury, platform treasury, caps, times, allocations, platform token fee |
| `getState()` | none | `totalRaised`, `totalSold`, `finalized`, `failed`, `cancelled`, `paused`, `treasuryClaimed`, `platformTonFeePaid`, `platformTonFee`, `creatorClaimable` |
| `getContribution(user)` | `Address` | User contribution in nanotons |
| `getClaimed(user)` | `Address` | Whether user has claimed |

## Frontend State Rules

- `upcoming`: `now < startTime`
- `live`: `startTime <= now <= endTime`
- `succeeded`: sale ended or hard cap filled, and `totalRaised >= softCap`
- `failed`: sale ended and `totalRaised < softCap`
- Show contribute only while live and not paused/cancelled.
- Show claim after success.
- Show refund after failure/cancellation.
- Show `Claim Treasury` to the creator after success.
- Do not show post-sale automation controls.

## Backend Integration

After wallet approval, immediately call:

```http
POST /api/launches
```

Save optimistic metadata even before token/pool addresses are reconciled. The backend later updates token master, presale pool, raised amount, claim/refund/treasury transaction state, and stats.

## Network Deployment

```bash
npm install
npm run contract:build
npx blueprint run deployLaunchpad
```

Use the deployed `LaunchpadFactory` address as `NEXT_PUBLIC_FACTORY_ADDRESS` and `FACTORY_ADDRESS`.
