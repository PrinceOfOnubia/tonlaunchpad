import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import '@ton/test-utils';
import { PresalePool } from '../build/PresalePool/PresalePool_PresalePool';

const DAY = 24 * 60 * 60;

type Fixture = {
  blockchain: Blockchain;
  pool: SandboxContract<PresalePool>;
  deployResult: Awaited<ReturnType<SandboxContract<PresalePool>['send']>>;
  owner: SandboxContract<TreasuryContract>;
  treasury: SandboxContract<TreasuryContract>;
  buyback: SandboxContract<TreasuryContract>;
  user: SandboxContract<TreasuryContract>;
  user2: SandboxContract<TreasuryContract>;
  jettonMaster: SandboxContract<TreasuryContract>;
  jettonWallet: SandboxContract<TreasuryContract>;
  startTime: number;
  endTime: number;
  claimStartTime: number;
};

type PoolConfig = {
  owner: SandboxContract<TreasuryContract>['address'];
  saleTokenJettonMaster: SandboxContract<TreasuryContract>['address'];
  saleTokenJettonWallet: SandboxContract<TreasuryContract>['address'];
  treasuryAddress: SandboxContract<TreasuryContract>['address'];
  buybackWallet: SandboxContract<TreasuryContract>['address'];
  presalePrice: bigint;
  softCap: bigint;
  hardCap: bigint;
  minContribution: bigint;
  maxContribution: bigint;
  startTime: bigint;
  endTime: bigint;
  claimStartTime: bigint;
  buybackEnabled: boolean;
  buybackPercentBps: bigint;
  buybackChunkBps: bigint;
  buybackIntervalSeconds: bigint;
  buybackStartTime: bigint;
};

async function deployFixture(overrides: Partial<PoolConfig> = {}): Promise<Fixture> {
  const blockchain = await Blockchain.create();
  blockchain.now = 1_800_000_000;

  const owner = await blockchain.treasury('owner');
  const treasury = await blockchain.treasury('treasury');
  const buyback = await blockchain.treasury('buyback');
  const user = await blockchain.treasury('user');
  const user2 = await blockchain.treasury('user2');
  const jettonMaster = await blockchain.treasury('jettonMaster');
  const jettonWallet = await blockchain.treasury('jettonWallet');

  const startTime = blockchain.now + 100;
  const endTime = startTime + DAY;
  const claimStartTime = endTime + 100;

  const init = {
    owner: owner.address,
    saleTokenJettonMaster: jettonMaster.address,
    saleTokenJettonWallet: jettonWallet.address,
    treasuryAddress: treasury.address,
    buybackWallet: buyback.address,
    presalePrice: 1_000_000_000n,
    softCap: toNano('10'),
    hardCap: toNano('20'),
    minContribution: toNano('1'),
    maxContribution: toNano('5'),
    startTime: BigInt(startTime),
    endTime: BigInt(endTime),
    claimStartTime: BigInt(claimStartTime),
    buybackEnabled: true,
    buybackPercentBps: 2000n,
    buybackChunkBps: 500n,
    buybackIntervalSeconds: 600n,
    buybackStartTime: BigInt(claimStartTime),
    ...overrides,
  };

  const pool = blockchain.openContract(await PresalePool.fromInit(
    init.owner,
    init.saleTokenJettonMaster,
    init.saleTokenJettonWallet,
    init.treasuryAddress,
    init.buybackWallet,
    init.presalePrice,
    init.softCap,
    init.hardCap,
    init.minContribution,
    init.maxContribution,
    init.startTime,
    init.endTime,
    init.claimStartTime,
    init.buybackEnabled,
    init.buybackPercentBps,
    init.buybackChunkBps,
    init.buybackIntervalSeconds,
    init.buybackStartTime,
  ));
  const deployResult = await pool.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'Deploy', queryId: 0n });

  return {
    blockchain,
    pool,
    deployResult,
    owner,
    treasury,
    buyback,
    user,
    user2,
    jettonMaster,
    jettonWallet,
    startTime,
    endTime,
    claimStartTime,
  };
}

async function contribute(f: Fixture, wallet: SandboxContract<TreasuryContract>, amount: bigint) {
  return f.pool.send(wallet.getSender(), { value: amount }, { $$type: 'Contribute' });
}

async function finalizeSuccessful(f: Fixture) {
  f.blockchain.now = f.startTime + 1;
  await contribute(f, f.user, toNano('5'));
  await contribute(f, f.user2, toNano('5'));
  f.blockchain.now = f.endTime + 1;
  return f.pool.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'Finalize' });
}

describe('PresalePool', () => {
  it('cannot contribute before start', async () => {
    const f = await deployFixture();
    const res = await contribute(f, f.user, toNano('1'));
    expect(res.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
  });

  it('cannot contribute after end', async () => {
    const f = await deployFixture();
    f.blockchain.now = f.endTime + 1;
    const res = await contribute(f, f.user, toNano('1'));
    expect(res.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
  });

  it('cannot exceed hardCap and refunds excess when a contribution crosses the cap', async () => {
    const f = await deployFixture({ maxContribution: toNano('20') });
    f.blockchain.now = f.startTime + 1;
    await contribute(f, f.user, toNano('19'));
    const res = await contribute(f, f.user2, toNano('5'));

    expect(res.transactions).toHaveTransaction({ from: f.pool.address, to: f.user2.address, success: true });
    expect((await f.pool.getGetState()).totalRaised).toEqual(toNano('20'));
    expect(await f.pool.getGetContribution(f.user2.address)).toEqual(toNano('1'));
  });

  it('enforces minContribution', async () => {
    const f = await deployFixture();
    f.blockchain.now = f.startTime + 1;
    const res = await contribute(f, f.user, toNano('0.5'));
    expect(res.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
  });

  it('enforces maxContribution per wallet', async () => {
    const f = await deployFixture();
    f.blockchain.now = f.startTime + 1;
    await contribute(f, f.user, toNano('4'));
    const res = await contribute(f, f.user, toNano('2'));
    expect(res.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
  });

  it('rejects buybackPercentBps above 4000 at deploy', async () => {
    const f = await deployFixture({ buybackPercentBps: 4001n });
    expect(f.deployResult.transactions).toHaveTransaction({ from: f.owner.address, to: f.pool.address, success: false });
  });

  it('treasury withdrawal excludes buyback reserve', async () => {
    const f = await deployFixture();
    await finalizeSuccessful(f);
    const state = await f.pool.getGetState();
    expect(state.buybackReserve).toEqual(toNano('2'));

    const res = await f.pool.send(f.treasury.getSender(), { value: toNano('0.05') }, { $$type: 'WithdrawTreasury' });
    expect(res.transactions).toHaveTransaction({ from: f.pool.address, to: f.treasury.address, value: toNano('8'), success: true });
  });

  it('buyback cannot release before buybackStartTime', async () => {
    const f = await deployFixture();
    await finalizeSuccessful(f);
    f.blockchain.now = f.claimStartTime - 1;
    const res = await f.pool.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'ReleaseBuybackChunk' });
    expect(res.transactions).toHaveTransaction({ from: f.owner.address, to: f.pool.address, success: false });
  });

  it('buyback releases only scheduled chunks', async () => {
    const f = await deployFixture();
    await finalizeSuccessful(f);
    f.blockchain.now = f.claimStartTime;

    const res = await f.pool.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'ReleaseBuybackChunk' });
    expect(res.transactions).toHaveTransaction({ from: f.pool.address, to: f.buyback.address, value: toNano('0.5'), success: true });
    expect((await f.pool.getGetState()).buybackReleased).toEqual(toNano('0.5'));
  });

  it('buyback cannot double-release same interval', async () => {
    const f = await deployFixture();
    await finalizeSuccessful(f);
    f.blockchain.now = f.claimStartTime;
    await f.pool.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'ReleaseBuybackChunk' });

    const res = await f.pool.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'ReleaseBuybackChunk' });
    expect(res.transactions).toHaveTransaction({ from: f.owner.address, to: f.pool.address, success: false });
  });

  it('claim works only after successful sale', async () => {
    const f = await deployFixture();
    f.blockchain.now = f.startTime + 1;
    await contribute(f, f.user, toNano('2'));
    await contribute(f, f.user2, toNano('5'));
    await contribute(f, f.owner, toNano('3'));
    f.blockchain.now = f.endTime + 1;

    const failed = await f.pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    expect(failed.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });

    f.blockchain.now = f.endTime + 2;
    await f.pool.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'Finalize' });
    f.blockchain.now = f.claimStartTime;

    const claimed = await f.pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    expect(claimed.transactions).toHaveTransaction({ from: f.pool.address, to: f.jettonWallet.address, success: true });
    expect(await f.pool.getGetClaimed(f.user.address)).toBe(true);
  });

  it('refund works only after failed or cancelled sale', async () => {
    const f = await deployFixture();
    f.blockchain.now = f.startTime + 1;
    await contribute(f, f.user, toNano('2'));

    const early = await f.pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });
    expect(early.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });

    f.blockchain.now = f.endTime + 1;
    const failed = await f.pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });
    expect(failed.transactions).toHaveTransaction({ from: f.pool.address, to: f.user.address, success: true });

    const cancelled = await deployFixture();
    cancelled.blockchain.now = cancelled.startTime + 1;
    await contribute(cancelled, cancelled.user, toNano('2'));
    await cancelled.pool.send(cancelled.owner.getSender(), { value: toNano('0.05') }, { $$type: 'CancelSale' });
    const refunded = await cancelled.pool.send(cancelled.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });
    expect(refunded.transactions).toHaveTransaction({ from: cancelled.pool.address, to: cancelled.user.address, success: true });
  });

  it('pause blocks contribution', async () => {
    const f = await deployFixture();
    f.blockchain.now = f.startTime + 1;
    await f.pool.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'Pause' });
    const res = await contribute(f, f.user, toNano('1'));
    expect(res.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
  });

  it('owner-only admin functions', async () => {
    const f = await deployFixture();
    const pause = await f.pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Pause' });
    const unpause = await f.pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Unpause' });
    const cancel = await f.pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'CancelSale' });
    f.blockchain.now = f.endTime + 1;
    const finalize = await f.pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Finalize' });

    expect(pause.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
    expect(unpause.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
    expect(cancel.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
    expect(finalize.transactions).toHaveTransaction({ from: f.user.address, to: f.pool.address, success: false });
  });
});
