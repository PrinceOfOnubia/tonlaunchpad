import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import { readFileSync } from 'fs';
import '@ton/test-utils';
import { LaunchpadFactory, LaunchToken } from '../build/Launchpad/Launchpad_LaunchpadFactory';
import { LaunchpadJettonMaster } from '../build/Launchpad/Launchpad_LaunchpadJettonMaster';
import { JettonWallet } from '../build/Launchpad/Launchpad_JettonWallet';
import { PresalePool } from '../build/Launchpad/Launchpad_PresalePool';

const DAY = 24 * 60 * 60;
const TOTAL_SUPPLY = 1_000_000_000_000_000_000n;
const PRESALE_ALLOCATION = 500_000_000_000_000_000n;
const PLATFORM_TOKEN_FEE = 5_000_000_000_000_000n;
const BUYER_ALLOCATION = 495_000_000_000_000_000n;
const LIQUIDITY_ALLOCATION = 300_000_000_000_000_000n;
const CREATOR_ALLOCATION = 200_000_000_000_000_000n;
const CREATOR_MANAGED_ALLOCATION = LIQUIDITY_ALLOCATION + CREATOR_ALLOCATION;

type Fixture = {
  blockchain: Blockchain;
  owner: SandboxContract<TreasuryContract>;
  creator: SandboxContract<TreasuryContract>;
  treasury: SandboxContract<TreasuryContract>;
  user: SandboxContract<TreasuryContract>;
  user2: SandboxContract<TreasuryContract>;
  factory: SandboxContract<LaunchpadFactory>;
  startTime: number;
  endTime: number;
};

async function fixture(): Promise<Fixture> {
  const blockchain = await Blockchain.create();
  blockchain.now = 1_800_000_000;

  const owner = await blockchain.treasury('platform');
  const creator = await blockchain.treasury('creator');
  const treasury = await blockchain.treasury('creator-treasury');
  const user = await blockchain.treasury('user');
  const user2 = await blockchain.treasury('user2');

  const factory = blockchain.openContract(await LaunchpadFactory.fromInit(owner.address));
  await factory.send(owner.getSender(), { value: toNano('0.2') }, { $$type: 'Deploy', queryId: 0n });

  return {
    blockchain,
    owner,
    creator,
    treasury,
    user,
    user2,
    factory,
    startTime: blockchain.now + 100,
    endTime: blockchain.now + 100 + DAY,
  };
}

function launchConfig(f: Fixture, overrides: Partial<LaunchToken> = {}): LaunchToken {
  return {
    $$type: 'LaunchToken',
    name: 'Aqua Pad',
    symbol: 'AQUA',
    description: 'Frontend launch flow token',
    metadata: beginCell().storeUint(1, 8).endCell(),
    totalSupply: TOTAL_SUPPLY,
    decimals: 9n,
    presalePercent: 50n,
    liquidityPercentTokens: 30n,
    creatorPercent: 20n,
    treasuryAddress: f.treasury.address,
    presaleRate: 1_000_000_000_000_000n,
    softCap: toNano('10'),
    hardCap: toNano('20'),
    minContribution: toNano('1'),
    maxContribution: toNano('20'),
    startTime: BigInt(f.startTime),
    endTime: BigInt(f.endTime),
    liquidityPercentOfRaised: 60n,
    ...overrides,
  };
}

async function launch(f: Fixture, overrides: Partial<LaunchToken> = {}) {
  const config = launchConfig(f, overrides);
  const res = await f.factory.send(f.creator.getSender(), { value: toNano('1') }, config);
  const record = await f.factory.getGetLaunch(0n);
  const token = f.blockchain.openContract(LaunchpadJettonMaster.fromAddress(record.token));
  const pool = f.blockchain.openContract(PresalePool.fromAddress(record.pool));
  return { config, res, record, token, pool };
}

async function jettonWallet(
  f: Fixture,
  token: SandboxContract<LaunchpadJettonMaster>,
  owner: Address,
) {
  const address = await token.getGetWalletAddress(owner);
  return f.blockchain.openContract(JettonWallet.fromAddress(address));
}

async function jettonBalance(
  f: Fixture,
  token: SandboxContract<LaunchpadJettonMaster>,
  owner: Address,
) {
  const wallet = await jettonWallet(f, token, owner);
  return (await wallet.getGetWalletData()).balance;
}

async function contribute(
  f: Fixture,
  pool: SandboxContract<PresalePool>,
  wallet: SandboxContract<TreasuryContract>,
  amount: bigint,
) {
  return pool.send(wallet.getSender(), { value: amount }, { $$type: 'Contribute' });
}

describe('classic manual-liquidity launchpad flow', () => {
  it('creates token + pool from factory and stores the record', async () => {
    const f = await fixture();
    const { record } = await launch(f);

    expect(await f.factory.getGetLaunchCount()).toEqual(1n);
    expect(record.creator).toEqualAddress(f.creator.address);
  });

  it('token allocations include 1% platform token fee and creator-managed liquidity', async () => {
    const f = await fixture();
    const { token, pool, record } = await launch(f);
    const poolConfig = await pool.getGetConfig();

    expect(poolConfig.presaleTokenAllocation).toEqual(PRESALE_ALLOCATION);
    expect(poolConfig.buyerTokenAllocation).toEqual(BUYER_ALLOCATION);
    expect(poolConfig.platformTokenFee).toEqual(PLATFORM_TOKEN_FEE);
    expect(poolConfig.liquidityTokenAllocation).toEqual(LIQUIDITY_ALLOCATION);
    expect(await jettonBalance(f, token, record.pool)).toEqual(BUYER_ALLOCATION);
    expect(await jettonBalance(f, token, f.owner.address)).toEqual(PLATFORM_TOKEN_FEE);
    expect(await jettonBalance(f, token, f.creator.address)).toEqual(CREATOR_MANAGED_ALLOCATION);
    expect((await token.getGetJettonData()).totalSupply).toEqual(TOTAL_SUPPLY);
  });

  it('contribution before start fails and active contribution works', async () => {
    const f = await fixture();
    const { pool } = await launch(f);

    const early = await contribute(f, pool, f.user, toNano('1'));
    expect(early.transactions).toHaveTransaction({ from: f.user.address, to: pool.address, success: false });

    f.blockchain.now = f.startTime + 1;
    const ok = await contribute(f, pool, f.user, toNano('2'));
    expect(ok.transactions).toHaveTransaction({ from: f.user.address, to: pool.address, success: true });
    expect(await pool.getGetContribution(f.user.address)).toEqual(toNano('2'));
  });

  it('hard cap is enforced with excess refund', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;

    await contribute(f, pool, f.user, toNano('19'));
    const res = await contribute(f, pool, f.user2, toNano('5'));

    expect(res.transactions).toHaveTransaction({ from: pool.address, to: f.user2.address, success: true });
    expect((await pool.getGetState()).totalRaised).toEqual(toNano('20'));
    expect(await pool.getGetContribution(f.user2.address)).toEqual(toNano('1'));
  });

  it('successful presale lets users claim directly without migration', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    const claim = await pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    const userWallet = await jettonWallet(f, token, f.user.address);

    expect(claim.transactions).toHaveTransaction({ from: pool.address, success: true });
    expect(claim.transactions).toHaveTransaction({ to: userWallet.address, success: true });
    expect(await jettonBalance(f, token, f.user.address)).toEqual(10_000_000_000_000_000n);
    expect((await pool.getGetState()).finalized).toBe(true);
  });

  it('platform receives 5% TON fee and creator receives remaining treasury', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    await contribute(f, pool, f.user2, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    const claim = await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'CreatorClaimTreasury' });
    const state = await pool.getGetState();

    expect(claim.transactions).toHaveTransaction({ from: pool.address, to: f.owner.address, value: toNano('1'), success: true });
    expect(claim.transactions).toHaveTransaction({ from: pool.address, to: f.treasury.address, value: toNano('19'), success: true });
    expect(state.platformTonFee).toEqual(toNano('1'));
    expect(state.creatorClaimable).toEqual(toNano('19'));
    expect(state.treasuryClaimed).toBe(true);
    expect(state.platformTonFeePaid).toBe(true);
  });

  it('creator cannot claim treasury twice or claim after failed presale', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'CreatorClaimTreasury' });
    const second = await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'CreatorClaimTreasury' });
    expect(second.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: false });

    const f2 = await fixture();
    const { pool: failedPool } = await launch(f2);
    f2.blockchain.now = f2.startTime + 1;
    await contribute(f2, failedPool, f2.user, toNano('2'));
    f2.blockchain.now = f2.endTime + 1;
    const failedClaim = await failedPool.send(f2.creator.getSender(), { value: toNano('0.05') }, { $$type: 'CreatorClaimTreasury' });
    expect(failedClaim.transactions).toHaveTransaction({ from: f2.creator.address, to: failedPool.address, success: false });
  });

  it('failed presale refunds work and double refund fails', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('2'));
    f.blockchain.now = f.endTime + 1;

    const refund = await pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });
    const second = await pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });

    expect(refund.transactions).toHaveTransaction({ from: pool.address, to: f.user.address, success: true });
    expect(second.transactions).toHaveTransaction({ from: f.user.address, to: pool.address, success: false });
  });

  it('double claim fails and refund fails after success', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    await pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    const secondClaim = await pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    const refund = await pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });

    expect(secondClaim.transactions).toHaveTransaction({ from: f.user.address, to: pool.address, success: false });
    expect(refund.transactions).toHaveTransaction({ from: f.user.address, to: pool.address, success: false });
  });

  it('migration and buyback messages are removed from the pool ABI', async () => {
    const abi = readFileSync('build/Launchpad/Launchpad_PresalePool.abi', 'utf8');
    expect(abi).not.toContain('MigrateLiquidity');
    expect(abi).not.toContain('ExecuteBuyback');
  });
});
