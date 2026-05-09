# TonPad

Fair and transparent TON presales.

TonPad is a classic manual-liquidity launchpad: creators deploy a Jetton and presale pool, users contribute TON during the sale window, contributors claim tokens after a successful sale, and failed sales are refundable. Creators handle liquidity externally after claiming treasury funds.

## Platform Fees

Fees are enforced by the smart contract on successful presales:

- `5%` of total TON raised goes to the platform treasury.
- `1%` of the presale token allocation goes to the platform Jetton wallet.
- The creator can claim raised TON remaining after the platform fee after success.
- Failed presales do not pay the TON platform fee.

Example: a sale raising `1000 TON` pays `50 TON` to the platform and `950 TON` to the creator treasury. A `500,000,000` token presale allocation sends `5,000,000` tokens to the platform and leaves `495,000,000` tokens for buyers.

## Frontend Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_API_URL` to the hosted backend `/api` URL for live token discovery.

## Backend / Indexer

The backend lives in `backend/` and provides launch persistence, token discovery, stats, profiles, transactions, upload hosting, metadata hosting, and TON testnet reconciliation.

```bash
cp .env.example .env
npm run backend:prisma:generate
npm run backend:prisma:migrate
npm run backend:dev
```

Required backend env:

```bash
DATABASE_URL=
TONCENTER_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
TONCENTER_API_KEY=
FACTORY_ADDRESS=EQARP90pfupm_ob9jlKzxqiq0eM1iGAHJep40a3cvxzy8YrL
NETWORK=testnet
PORT=4000
FRONTEND_ORIGIN=https://tonlaunchpad.vercel.app
BACKEND_PUBLIC_URL=
PUBLIC_UPLOAD_BASE_URL=
UPLOAD_DIR=backend/uploads
```

## Backend API

- `GET /health`
- `GET /api/launches?status=all|live|upcoming|trending|succeeded|concluded&search=&sort=newest|oldest|volume`
- `GET /api/launches/:id`
- `POST /api/launches`
- `GET /api/stats`
- `GET /api/profile/:wallet`
- `GET /api/transactions/:wallet`
- `POST /api/upload/image`
- `POST /api/metadata`

`POST /api/launches` is called immediately after wallet approval. If the API is temporarily unavailable, the on-chain launch transaction remains valid and the frontend keeps a local fallback.

## Contracts

Compiled from `contracts/Launchpad.tact`:

- `LaunchpadFactory`: receives the create config, deploys the Jetton master and `PresalePool`, mints buyer allocation to the pool, platform token fee to the platform treasury, and creator-managed tokens to the creator.
- `LaunchpadJettonMaster`: TEP-74 compatible Jetton master.
- `JettonWallet`: deterministic TEP-74 compatible Jetton wallet.
- `PresalePool`: accepts contributions, enforces caps/windows, handles user claims, refunds, failed-token recovery, and creator treasury claims.

## Presale Flow

1. Creator submits `LaunchToken` to `LaunchpadFactory`.
2. Factory deploys Jetton master and pool.
3. Factory mints:
   - `99%` of the presale allocation to the pool for buyers.
   - `1%` of the presale allocation to the platform treasury.
   - creator allocation plus manual-liquidity allocation to the creator.
4. Users contribute TON while the sale is live.
5. If `totalRaised >= softCap`, users can claim Jettons directly from the pool.
6. Creator calls `CreatorClaimTreasury` or `WithdrawTreasury`.
7. Pool sends `5%` of raised TON to the platform TON treasury and the remaining TON to creator treasury.
8. If the sale fails or is cancelled, users refund TON and creator can recover unsold buyer tokens.

There is no post-sale automation in this architecture. Creator liquidity is handled manually outside the presale pool.

## Development

```bash
npm run build
npm run lint
npm test
```

## Testnet Deployment

```bash
npm install
npm run contract:build
npx blueprint run deployLaunchpad --testnet
```

Deploy `LaunchpadFactory`, then set the factory address in frontend and backend env.
