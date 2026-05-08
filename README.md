# TonPad

Production-ready TON presale launchpad with programmatic buybacks (0–40%).
Next.js 14 frontend + Tact smart contracts.

---

## Frontend Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# Fill in NEXT_PUBLIC_API_URL (your backend) — at minimum.
# NEXT_PUBLIC_SITE_URL is optional in dev (auto-detected from window).

# 3. Run
npm run dev      # http://localhost:3000
```

## Backend / Indexer Quick Start

The MVP backend lives in `backend/` and provides token discovery, stats,
profiles, transactions, and a TON testnet reconciliation loop.

```bash
# 1. Configure env
cp .env.example .env
# Fill DATABASE_URL and TONCENTER_API_KEY.

# 2. Generate Prisma client and migrate Postgres
npm run backend:prisma:generate
npm run backend:prisma:migrate

# 3. Run the API/indexer locally
npm run backend:dev      # http://localhost:4000
```

Required backend env:

```bash
DATABASE_URL=
TONCENTER_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
TONCENTER_API_KEY=
FACTORY_ADDRESS=EQCadGgX-fT-oYaR5iyrCPHYTrXWjx1Pmcxj9_E83qoHuwoR
DEX_ADAPTER_ADDRESS=EQAxVYGGW85GzumFpfoXPm6SJmSlxB-n7eNEZDYq4YH5sUcp
NETWORK=testnet
PORT=4000
FRONTEND_ORIGIN=https://tonlaunchpad.vercel.app
```

### Backend API

- `GET /health`
- `GET /api/launches?status=all|live|upcoming|trending|succeeded&search=&sort=newest|oldest|liquidity|volume`
- `GET /api/launches/:id`
- `POST /api/launches` - called by the frontend after wallet approval. If this fails, the launch transaction is still valid and the frontend keeps a local fallback cache.
- `GET /api/stats`
- `GET /api/profile/:wallet`
- `GET /api/transactions/:wallet`

The backend also exposes compatibility aliases under `/api/tokens` and
`/api/users/...` while the frontend transitions fully to launch-indexed data.

### Railway / Render Notes

Use the repo root as the service root. Recommended commands:

```bash
npm install
npm run backend:prisma:generate
npm run backend:build
npm run backend:prisma:migrate
npm run backend:start
```

Set `NEXT_PUBLIC_API_URL` in Vercel to your hosted backend URL with `/api`,
for example `https://tonpad-indexer.up.railway.app/api`.

### What's in / what's out

- **No mock data.** When the backend is unreachable, stats show `—`,
  token lists show "no tokens yet" empty states. The UI never lies.
- **TON wallet via TonConnect.** The provider is initialized synchronously,
  so the "Connect Wallet" button works on first render.
- **Production-only data flow.** Every component pulls from `lib/api.ts`
  (typed fetch + SWR). Configure `NEXT_PUBLIC_API_URL` to wire the backend.

### TonConnect manifest — important for production

`public/tonconnect-manifest.json` defaults to a placeholder URL. Before
launching, replace `url` with your real production domain. The wallet
displays this to the user during the connection prompt:

```json
{
  "url": "https://your-real-domain.com",
  "name": "TonPad",
  "iconUrl": "https://your-real-domain.com/icon.png"
}
```

Also set `NEXT_PUBLIC_SITE_URL` to the same domain so the manifest URL
the wallet fetches matches the deployed location.

### Deployment (Vercel)

1. Push to GitHub.
2. Import the repo into Vercel.
3. Set env vars: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`.
4. Update `public/tonconnect-manifest.json` `url` to your Vercel domain.

---

# Contracts

Tact + Blueprint/Sandbox contract layer for the TonPad frontend launch flow.

The current launchpad layer has five contracts compiled from `contracts/Launchpad.tact`:

- `LaunchpadFactory` - receives the frontend create config, deploys a token and pool, mints allocations, and stores launch records.
- `LaunchpadJettonMaster` - TEP-74 compatible Jetton master for each launched token.
- `JettonWallet` - deterministic TEP-74 compatible Jetton wallet for holders, pools, and adapters.
- `PresalePool` - accepts TON, enforces caps/windows, owns presale and liquidity token allocations, migrates liquidity, enables claims/refunds, and manages treasury/buyback reserves.
- `DexAdapter` - DEX boundary stub. It records liquidity migrations and buyback executions. Full DeDust or STON.fi integration should live behind this interface.

## Frontend Launch Flow

1. Frontend submits `LaunchToken` to `LaunchpadFactory`.
2. Factory validates allocation totals, caps, schedule, liquidity percent, and buyback limits.
3. Factory deploys `LaunchpadJettonMaster`.
4. Factory deploys `PresalePool`.
5. Factory mints:
   - presale allocation + liquidity allocation to the `PresalePool` Jetton wallet
   - creator allocation to the creator Jetton wallet
6. Users contribute TON to `PresalePool` during the active window.
7. If `totalRaised >= softCap`, anyone can call `MigrateLiquidity` after the sale ends, or immediately once hard cap is filled.
8. Pool calculates:
   - `liquidityTON = totalRaised * liquidityPercentOfRaised / 100`
   - `treasuryTON = totalRaised - liquidityTON`
   - `buybackReserve = treasuryTON * buybackPercentBps / 10000`
9. Pool sends `liquidityTON` and real Jettons from the pool Jetton wallet to the `DexAdapter` Jetton wallet, then sets `migrationDone = true`.
10. Contributors can claim real Jettons to their Jetton wallets only after `migrationDone`.
11. Treasury can withdraw only after migration, and never receives liquidity TON or buyback reserve.
12. If the sale fails, contributors can refund and creator can recover unsold token allocations. No migration or buyback is allowed.

## Buybacks

Buybacks are reserved TON routed through `DexAdapter`.

- `buybackPercentBps` must be `<= 4000`.
- `buybackChunkBps` must be `<= buybackPercentBps`.
- Buybacks start only after liquidity migration/listing.
- `ExecuteBuyback` calculates elapsed intervals since sale end and releases only newly scheduled TON.
- Double execution of the same interval is rejected.

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

## Files

- `contracts/Launchpad.tact` - factory, Jetton master/wallet, pool, DEX adapter
- `tests/Launchpad.spec.ts` - full frontend launch-flow tests
- `scripts/deployLaunchpad.ts` - deploys factory and adapter
- `frontend-integration.md` - message/getter reference for the frontend/backend

## Testnet Notes

Deploy `LaunchpadFactory` and `DexAdapter` first. The frontend/backend should call `LaunchToken` on the factory for each launch. Each launch deploys its own Jetton master and deterministic Jetton wallets are deployed/used as allocations move.
