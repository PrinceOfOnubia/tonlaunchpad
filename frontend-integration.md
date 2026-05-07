# Frontend Integration

## Deploy Config

Create one `PresalePool` per presale with:

- `owner: Address`
- `saleTokenJettonMaster: Address`
- `saleTokenJettonWallet: Address`
- `treasuryAddress: Address`
- `buybackWallet: Address`
- `presalePrice: bigint` - Jetton nano-units per 1 TON
- `softCap: bigint` - nanotons
- `hardCap: bigint` - nanotons
- `minContribution: bigint` - nanotons
- `maxContribution: bigint` - nanotons
- `startTime: bigint` - Unix seconds
- `endTime: bigint` - Unix seconds
- `claimStartTime: bigint` - Unix seconds
- `buybackEnabled: boolean`
- `buybackPercentBps: bigint` - 0 to 4000
- `buybackChunkBps: bigint` - must be `<= buybackPercentBps`
- `buybackIntervalSeconds: bigint`
- `buybackStartTime: bigint` - Unix seconds

## Messages

All messages are typed Tact messages.

| Message | Sender | Value | Purpose |
| --- | --- | --- | --- |
| `Contribute` | User | Contribution amount in TON | Contribute during active sale window |
| `Finalize` | Owner | Gas | Finalize successful sale after `endTime` and `softCap` met |
| `ClaimTokens` | User | Gas | Claim Jettons after successful finalization and `claimStartTime` |
| `Refund` | User | Gas | Refund if cancelled or failed after `endTime` |
| `WithdrawTreasury` | Treasury | Gas | Withdraw raised TON excluding buyback reserve |
| `ReleaseBuybackChunk` | Anyone | Gas | Release scheduled buyback TON to `buybackWallet` |
| `Pause` | Owner | Gas | Pause contributions |
| `Unpause` | Owner | Gas | Resume contributions |
| `CancelSale` | Owner | Gas | Cancel before finalization |

## Getter Methods

| Getter | Args | Returns |
| --- | --- | --- |
| `getConfig()` | none | Deployment config: owner, Jetton addresses, treasury, buyback wallet, price, caps, limits, timestamps, buyback settings |
| `getState()` | none | `totalRaised`, `totalSold`, `finalized`, `cancelled`, `paused`, `buybackReleased`, `buybackReserve`, `treasuryWithdrawn` |
| `getContribution(user)` | `Address` | User contribution in nanotons |
| `getClaimed(user)` | `Address` | Whether user has claimed Jettons |
| `getRefunded(user)` | `Address` | Whether user has refunded |
| `getAvailableBuyback(nowTs)` | Unix seconds | TON currently releasable to `buybackWallet` |

## Frontend State Rules

- Show contribute action only when sale is active, not paused, not cancelled, and not finalized.
- Show finalize action to owner after `endTime` when `totalRaised >= softCap`.
- Show claim action after `finalized && now >= claimStartTime`.
- Show refund action when `cancelled || (now > endTime && totalRaised < softCap)`.
- Show treasury withdrawal only after successful finalization.
- Show buyback release when `getAvailableBuyback(nowTs) > 0`.

## Deployment Notes For Testnet

1. Deploy or identify the sale token Jetton master.
2. Derive the pool's Jetton wallet address for `saleTokenJettonMaster`.
3. Deploy `PresalePool` with the final config.
4. Transfer the full sale token allocation to `saleTokenJettonWallet` before `claimStartTime`.
5. Run a small end-to-end testnet sale with low caps.
6. Verify `WithdrawTreasury` sends only non-buyback funds.
7. Verify `ReleaseBuybackChunk` sends scheduled TON to `buybackWallet`.

Example:

```bash
npm install
npm run build
npx blueprint run deployPresalePool --testnet
```
