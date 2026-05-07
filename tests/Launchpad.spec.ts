import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, toNano } from '@ton/core';
import '@ton/test-utils';
import { LaunchpadFactory, LaunchToken } from '../build/Launchpad/Launchpad_LaunchpadFactory';
import { LaunchpadJettonMaster } from '../build/Launchpad/Launchpad_LaunchpadJettonMaster';
import { JettonWallet } from '../build/Launchpad/Launchpad_JettonWallet';
import { PresalePool } from '../build/Launchpad/Launchpad_PresalePool';
import { DexAdapter } from '../build/Launchpad/Launchpad_DexAdapter';

const DAY = 24 * 60 * 60;
const TOTAL_SUPPLY = 1_000_000_000_000_000_000n;
const PRESALE_ALLOCATION = 500_000_000_000_000_000n;
const LIQUIDITY_ALLOCATION = 300_000_000_000_000_000n;
const CREATOR_ALLOCATION = 200_000_000_000_000_000n;

type Fixture = {
  blockchain: Blockchain;
  owner: SandboxContract<TreasuryContract>;
  creator: SandboxContract<TreasuryContract>;
  treasury: SandboxContract<TreasuryContract>;
  buyback: SandboxContract<TreasuryContract>;
  user: SandboxContract<TreasuryContract>;
  user2: SandboxContract<TreasuryContract>;
  factory: SandboxContract<LaunchpadFactory>;
  dex: SandboxContract<DexAdapter>;
  startTime: number;
  endTime: number;
};

async function fixture(): Promise<Fixture> {
  const blockchain = await Blockchain.create();
  blockchain.now = 1_800_000_000;

  const owner = await blockchain.treasury('owner');
  const creator = await blockchain.treasury('creator');
  const treasury = await blockchain.treasury('treasury');
  const buyback = await blockchain.treasury('buyback');
  const user = await blockchain.treasury('user');
  const user2 = await blockchain.treasury('user2');

  const factory = blockchain.openContract(await LaunchpadFactory.fromInit(owner.address));
  await factory.send(owner.getSender(), { value: toNano('0.2') }, { $$type: 'Deploy', queryId: 0n });

  const dex = blockchain.openContract(await DexAdapter.fromInit(owner.address));
  await dex.send(owner.getSender(), { value: toNano('0.2') }, { $$type: 'Deploy', queryId: 0n });

  return {
    blockchain,
    owner,
    creator,
    treasury,
    buyback,
    user,
    user2,
    factory,
    dex,
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
    dexAdapter: f.dex.address,
    buybackWallet: f.buyback.address,
    presaleRate: 1_000_000_000_000_000n,
    softCap: toNano('10'),
    hardCap: toNano('20'),
    minContribution: toNano('1'),
    maxContribution: toNano('20'),
    startTime: BigInt(f.startTime),
    endTime: BigInt(f.endTime),
    liquidityPercentOfRaised: 60n,
    buybackEnabled: true,
    buybackPercentBps: 2000n,
    buybackChunkBps: 500n,
    buybackIntervalSeconds: 600n,
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

describe('Launchpad frontend flow', () => {
  it('creates token + pool from factory and stores the record', async () => {
    const f = await fixture();
    const { record } = await launch(f);

    expect(await f.factory.getGetLaunchCount()).toEqual(1n);
    expect(record.creator).toEqualAddress(f.creator.address);
  });

  it('token allocations are correct and pool is funded before presale starts', async () => {
    const f = await fixture();
    const { token, pool, record } = await launch(f);
    const poolConfig = await pool.getGetConfig();

    expect(poolConfig.presaleTokenAllocation).toEqual(PRESALE_ALLOCATION);
    expect(poolConfig.liquidityTokenAllocation).toEqual(LIQUIDITY_ALLOCATION);
    expect(await jettonBalance(f, token, record.pool)).toEqual(PRESALE_ALLOCATION + LIQUIDITY_ALLOCATION);
    expect(await jettonBalance(f, token, f.creator.address)).toEqual(CREATOR_ALLOCATION);
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

  it('soft cap reached but hard cap not reached succeeds and migrates liquidity', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('6'));
    await contribute(f, pool, f.user2, toNano('5'));
    f.blockchain.now = f.endTime + 1;

    const res = await pool.send(f.creator.getSender(), { value: toNano('0.5') }, { $$type: 'MigrateLiquidity' });
    const state = await pool.getGetState();

    expect(res.transactions).toHaveTransaction({ from: pool.address, to: f.dex.address, value: toNano('6.6'), success: true });
    expect(state.finalized).toBe(true);
    expect(state.migrationDone).toBe(true);
    expect(state.liquidityTON).toEqual(toNano('6.6'));
    expect(state.buybackReserve).toEqual(toNano('0.88'));
    expect(await jettonBalance(f, token, f.dex.address)).toEqual(LIQUIDITY_ALLOCATION);
  });

  it('below soft cap is refundable and has no DEX migration', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('2'));
    f.blockchain.now = f.endTime + 1;

    const migration = await pool.send(f.creator.getSender(), { value: toNano('0.2') }, { $$type: 'MigrateLiquidity' });
    const refund = await pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });

    expect(migration.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: false });
    expect(refund.transactions).toHaveTransaction({ from: pool.address, to: f.user.address, success: true });
    expect((await f.dex.getGetDexState()).migrations).toEqual(0n);
  });

  it('claim only works after migration and refund fails after success', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    const claimBefore = await pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    expect(claimBefore.transactions).toHaveTransaction({ from: f.user.address, to: pool.address, success: false });

    await pool.send(f.creator.getSender(), { value: toNano('0.5') }, { $$type: 'MigrateLiquidity' });
    const refund = await pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });
    const claim = await pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });

    expect(refund.transactions).toHaveTransaction({ from: f.user.address, to: pool.address, success: false });
    const userWallet = await jettonWallet(f, token, f.user.address);
    expect(claim.transactions).toHaveTransaction({ from: pool.address, success: true });
    expect(claim.transactions).toHaveTransaction({ to: userWallet.address, success: true });
    expect(await jettonBalance(f, token, f.user.address)).toEqual(10_000_000_000_000_000n);
  });

  it('treasury cannot withdraw liquidity or buyback reserve', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;
    await pool.send(f.creator.getSender(), { value: toNano('0.5') }, { $$type: 'MigrateLiquidity' });

    const res = await pool.send(f.treasury.getSender(), { value: toNano('0.05') }, { $$type: 'WithdrawTreasury' });

    expect(res.transactions).toHaveTransaction({ from: pool.address, to: f.treasury.address, value: toNano('3.2'), success: true });
    expect((await pool.getGetState()).treasuryWithdrawn).toEqual(toNano('3.2'));
  });

  it('buyback cannot execute before migration and cannot double execute the same interval', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    const before = await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'ExecuteBuyback' });
    expect(before.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: false });

    await pool.send(f.creator.getSender(), { value: toNano('0.5') }, { $$type: 'MigrateLiquidity' });
    const first = await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'ExecuteBuyback' });
    const second = await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'ExecuteBuyback' });

    expect(first.transactions).toHaveTransaction({ from: pool.address, to: f.dex.address, value: toNano('0.2'), success: true });
    expect(second.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: false });
  });

  it('migration can only happen once', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    await pool.send(f.creator.getSender(), { value: toNano('0.5') }, { $$type: 'MigrateLiquidity' });
    const second = await pool.send(f.creator.getSender(), { value: toNano('0.5') }, { $$type: 'MigrateLiquidity' });

    expect(second.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: false });
    expect((await f.dex.getGetDexState()).migrations).toEqual(1n);
  });
});
