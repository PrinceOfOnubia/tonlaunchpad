# TON Presale Launchpad Contracts

Reusable TON/Tact contract layer for a presale launchpad MVP. The frontend is expected to deploy one `PresalePool` contract per presale and call the typed messages documented in `frontend-integration.md`.

## Contract

`PresalePool` accepts TON contributions during a configured sale window and later allows contributors to claim Jettons if the sale succeeds, or refund TON if the sale fails or is cancelled.

The pool stores:

- presale config: owner, sale token Jetton master and wallet, treasury, buyback wallet, caps, contribution limits, sale window, claim start
- accounting: total raised, total sold, contribution per wallet, claim/refund state
- lifecycle flags: finalized, cancelled, paused
- buyback reserve state: enabled flag, percent, chunk size, interval, start time, released amount, reserve amount

## Flow

1. Owner deploys a new `PresalePool` for one presale.
2. Users send `Contribute` with TON while `startTime <= now <= endTime`.
3. The contract enforces min/max contribution and hard cap. If a contribution crosses the hard cap, only the remaining cap is accepted and the excess is refunded.
4. After the sale ends, owner sends `Finalize`.
5. If `totalRaised >= softCap`, the sale succeeds. Buyback reserve is calculated once at finalization.
6. Contributors send `ClaimTokens` after `claimStartTime`; the pool instructs its configured sale token Jetton wallet to transfer sale tokens.
7. Treasury sends `WithdrawTreasury`; withdrawable TON is `totalRaised - buybackReserve - treasuryWithdrawn`.
8. If the sale fails or owner cancels before finalization, contributors send `Refund`.

## Buyback Mode

The contract does not perform DEX buys. It only reserves TON and releases scheduled TON chunks to `buybackWallet`.

Constraints:

- `buybackPercentBps <= 4000`
- `buybackChunkBps <= buybackPercentBps`
- treasury withdrawal always excludes `buybackReserve`
- `ReleaseBuybackChunk` calculates elapsed intervals and sends only newly available TON
- double release in the same interval is rejected

## Development

```bash
npm install
npm run build
npm test
```

## Files

- `contracts/PresalePool.tact` - Tact smart contract
- `tests/PresalePool.spec.ts` - Blueprint/Sandbox tests
- `scripts/deployPresalePool.ts` - testnet deployment template
- `frontend-integration.md` - frontend message and getter reference

## Notes

The pool must be funded with enough sale Jettons in `saleTokenJettonWallet` before claims begin. The configured `saleTokenJettonWallet` should be the pool's Jetton wallet for the sale token master.
