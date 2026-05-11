import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { readFileSync } from 'fs';
import '@ton/test-utils';
import { LaunchpadFactory, LaunchToken } from '../build/Launchpad/Launchpad_LaunchpadFactory';
import { LaunchpadJettonMaster } from '../build/Launchpad/Launchpad_LaunchpadJettonMaster';
import { JettonWallet } from '../build/Launchpad/Launchpad_JettonWallet';
import { PresalePool } from '../build/Launchpad/Launchpad_PresalePool';

const DAY = 24 * 60 * 60;
const TOTAL_SUPPLY = 1_000_000_000_000_000_000n;
const PRESALE_ALLOCATION = 500_000_000_000_000_000n;
const PLATFORM_TOKEN_FEE = 10_000_000_000_000_000n;
const PLATFORM_TOKEN_TON_SHARE = 5_000_000_000_000_000n;
const PLATFORM_TOKEN_TOKEN_SHARE = 5_000_000_000_000_000n;
const BUYER_ALLOCATION = 490_000_000_000_000_000n;
const LIQUIDITY_ALLOCATION = 300_000_000_000_000_000n;
const CREATOR_ALLOCATION = 200_000_000_000_000_000n;
const CREATOR_WITH_LIQUIDITY = 500_000_000_000_000_000n;

type Fixture = {
  blockchain: Blockchain;
  owner: SandboxContract<TreasuryContract>;
  platformTonTreasury: SandboxContract<TreasuryContract>;
  platformTokenTreasury: SandboxContract<TreasuryContract>;
  creator: SandboxContract<TreasuryContract>;
  treasury: SandboxContract<TreasuryContract>;
  liquidityTreasury: SandboxContract<TreasuryContract>;
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
  const platformTonTreasury = await blockchain.treasury('platform-ton');
  const platformTokenTreasury = await blockchain.treasury('platform-token');
  const creator = await blockchain.treasury('creator');
  const treasury = await blockchain.treasury('creator-treasury');
  const liquidityTreasury = await blockchain.treasury('liquidity');
  const user = await blockchain.treasury('user');
  const user2 = await blockchain.treasury('user2');

  const factory = blockchain.openContract(await LaunchpadFactory.fromInit(owner.address));
  await factory.send(owner.getSender(), { value: toNano('0.2') }, { $$type: 'Deploy', queryId: 0n });
  await factory.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTonTreasury', newAddress: platformTonTreasury.address });
  await factory.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTokenTreasury', newAddress: platformTokenTreasury.address });

  return {
    blockchain,
    owner,
    platformTonTreasury,
    platformTokenTreasury,
    creator,
    treasury,
    liquidityTreasury,
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
    metadata: beginCell().storeUint(1, 8).storeStringTail('https://tonpad.org/default-token-metadata.json').endCell(),
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
    liquidityPercentOfRaised: 3000n,
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

async function jettonBalanceOrZero(
  f: Fixture,
  token: SandboxContract<LaunchpadJettonMaster>,
  owner: Address,
) {
  try {
    return await jettonBalance(f, token, owner);
  } catch (error) {
    if (error instanceof Error && error.message.includes('non-active contract')) {
      return 0n;
    }
    throw error;
  }
}

async function contribute(
  f: Fixture,
  pool: SandboxContract<PresalePool>,
  wallet: SandboxContract<TreasuryContract>,
  amount: bigint,
) {
  return pool.send(wallet.getSender(), { value: amount }, { $$type: 'Contribute' });
}

function readMetadataUrl(cell: Cell) {
  const slice = cell.beginParse();
  expect(slice.loadUint(8)).toEqual(1);
  return slice.loadStringTail();
}

function getTxValue(transactions: any[], from: Address, to: Address) {
  const match = transactions.find(
    (tx) =>
      tx.inMessage?.info?.type === 'internal' &&
      tx.inMessage.info.src?.equals?.(from) &&
      tx.inMessage.info.dest?.equals?.(to) &&
      tx.description?.aborted === false &&
      typeof tx.inMessage.info.value?.coins === 'bigint',
  );
  return match?.inMessage?.info?.value?.coins ?? null;
}

describe('TONPad public fee architecture', () => {
  it('stores the new factory config and launch record', async () => {
    const f = await fixture();
    const { record } = await launch(f);
    const factoryConfig = await f.factory.getGetFactoryConfig();

    expect(await f.factory.getGetLaunchCount()).toEqual(1n);
    expect(record.creator).toEqualAddress(f.creator.address);
    expect(factoryConfig.owner).toEqualAddress(f.owner.address);
    expect(factoryConfig.platformTonTreasury).toEqualAddress(f.platformTonTreasury.address);
    expect(factoryConfig.platformTokenTreasury).toEqualAddress(f.platformTokenTreasury.address);
    expect(factoryConfig.platformTonFeeBps).toEqual(500n);
    expect(factoryConfig.platformTokenFeeBps).toEqual(100n);
  });

  it('deducts the 1% token fee only from presale allocation', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);
    const poolConfig = await pool.getGetConfig();

    expect(poolConfig.totalSupply).toEqual(TOTAL_SUPPLY);
    expect(poolConfig.presaleTokenAllocation).toEqual(PRESALE_ALLOCATION);
    expect(poolConfig.platformTokenFee).toEqual(PLATFORM_TOKEN_FEE);
    expect(poolConfig.buyerTokenAllocation).toEqual(BUYER_ALLOCATION);
    expect(poolConfig.platformTokenFeeTonTreasuryShare).toEqual(PLATFORM_TOKEN_TON_SHARE);
    expect(poolConfig.platformTokenFeeTokenTreasuryShare).toEqual(PLATFORM_TOKEN_TOKEN_SHARE);
    expect(poolConfig.liquidityTokenAllocation).toEqual(LIQUIDITY_ALLOCATION);
    expect(await jettonBalance(f, token, f.creator.address)).toEqual(CREATOR_WITH_LIQUIDITY);
    expect(await jettonBalance(f, token, pool.address)).toEqual(BUYER_ALLOCATION);
    expect(await jettonBalance(f, token, f.platformTonTreasury.address)).toEqual(PLATFORM_TOKEN_TON_SHARE);
    expect(await jettonBalance(f, token, f.platformTokenTreasury.address)).toEqual(PLATFORM_TOKEN_TOKEN_SHARE);
  });

  it('deploys creator-provided token metadata on-chain', async () => {
    const f = await fixture();
    const metadataUrl = 'https://tonpad.org/uploads/aqua-pad.json';
    const { token } = await launch(f, {
      name: 'Aqua Pad',
      symbol: 'AQUA',
      description: 'Unique aqua token',
      metadata: beginCell().storeUint(1, 8).storeStringTail(metadataUrl).endCell(),
    });

    const metadata = await token.getGetTokenMetadata();

    expect(metadata.name).toEqual('Aqua Pad');
    expect(metadata.symbol).toEqual('AQUA');
    expect(metadata.description).toEqual('Unique aqua token');
    expect(metadata.decimals).toEqual(9n);
    expect(readMetadataUrl(metadata.metadata)).toEqual(metadataUrl);
  });

  it('keeps token metadata unique across launches', async () => {
    const f = await fixture();
    const first = await launch(f, {
      name: 'Aqua Pad',
      symbol: 'AQUA',
      description: 'First token',
      metadata: beginCell().storeUint(1, 8).storeStringTail('https://tonpad.org/uploads/aqua.json').endCell(),
    });
    const secondConfig = launchConfig(f, {
      name: 'Zenith',
      symbol: 'ZNTH',
      description: 'Second token',
      metadata: beginCell().storeUint(1, 8).storeStringTail('https://tonpad.org/uploads/zenith.json').endCell(),
      startTime: BigInt(f.startTime + 1_000),
      endTime: BigInt(f.endTime + 1_000),
    });
    await f.factory.send(f.creator.getSender(), { value: toNano('1') }, secondConfig);
    const secondRecord = await f.factory.getGetLaunch(1n);
    const secondToken = f.blockchain.openContract(LaunchpadJettonMaster.fromAddress(secondRecord.token));

    const firstMetadata = await first.token.getGetTokenMetadata();
    const secondMetadata = await secondToken.getGetTokenMetadata();

    expect(firstMetadata.name).toEqual('Aqua Pad');
    expect(firstMetadata.symbol).toEqual('AQUA');
    expect(readMetadataUrl(firstMetadata.metadata)).toEqual('https://tonpad.org/uploads/aqua.json');
    expect(secondMetadata.name).toEqual('Zenith');
    expect(secondMetadata.symbol).toEqual('ZNTH');
    expect(readMetadataUrl(secondMetadata.metadata)).toEqual('https://tonpad.org/uploads/zenith.json');
  });

  it('enforces fee caps', async () => {
    const f = await fixture();

    const tonFail = await f.factory.send(
      f.owner.getSender(),
      { value: toNano('0.05') },
      { $$type: 'UpdatePlatformTonFeeBps', newFeeBps: 501n },
    );
    const tokenFail = await f.factory.send(
      f.owner.getSender(),
      { value: toNano('0.05') },
      { $$type: 'UpdatePlatformTokenFeeBps', newFeeBps: 501n },
    );
    const tokenOk = await f.factory.send(
      f.owner.getSender(),
      { value: toNano('0.05') },
      { $$type: 'UpdatePlatformTokenFeeBps', newFeeBps: 300n },
    );

    expect(tonFail.transactions).toHaveTransaction({ from: f.owner.address, to: f.factory.address, success: false });
    expect(tokenFail.transactions).toHaveTransaction({ from: f.owner.address, to: f.factory.address, success: false });
    expect(tokenOk.transactions).toHaveTransaction({ from: f.owner.address, to: f.factory.address, success: true });
  });

  it('keeps old presales on old fee rates and new presales on updated rates', async () => {
    const f = await fixture();
    const first = await launch(f);

    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTonFeeBps', newFeeBps: 250n });
    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTokenFeeBps', newFeeBps: 300n });

    const secondConfig = launchConfig(f, {
      name: 'Brine',
      symbol: 'BRN',
      startTime: BigInt(f.startTime + 1_000),
      endTime: BigInt(f.endTime + 1_000),
    });
    await f.factory.send(f.creator.getSender(), { value: toNano('1') }, secondConfig);
    const secondRecord = await f.factory.getGetLaunch(1n);
    const secondPool = f.blockchain.openContract(PresalePool.fromAddress(secondRecord.pool));

    const firstPoolConfig = await first.pool.getGetConfig();
    const secondPoolConfig = await secondPool.getGetConfig();

    expect(firstPoolConfig.platformTonFeeBps).toEqual(500n);
    expect(firstPoolConfig.platformTokenFeeBps).toEqual(100n);
    expect(secondPoolConfig.platformTonFeeBps).toEqual(250n);
    expect(secondPoolConfig.platformTokenFeeBps).toEqual(300n);
  });

  it('routes liquidity token allocation to creator when liquidity treasury is unset', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);
    expect(await jettonBalance(f, token, f.creator.address)).toEqual(CREATOR_WITH_LIQUIDITY);
    expect(await jettonBalance(f, token, pool.address)).toEqual(BUYER_ALLOCATION);

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    await contribute(f, pool, f.user2, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    await pool.send(f.creator.getSender(), { value: toNano('1') }, { $$type: 'CreatorClaimTreasury' });

    expect(await jettonBalance(f, token, f.creator.address)).toEqual(CREATOR_WITH_LIQUIDITY);
    expect(await jettonBalance(f, token, f.platformTonTreasury.address)).toEqual(PLATFORM_TOKEN_TON_SHARE);
    expect(await jettonBalance(f, token, f.platformTokenTreasury.address)).toEqual(PLATFORM_TOKEN_TOKEN_SHARE);
  });

  it('routes liquidity allocation to liquidity treasury when configured', async () => {
    const f = await fixture();
    await f.factory.send(
      f.owner.getSender(),
      { value: toNano('0.05') },
      { $$type: 'UpdateLiquidityTreasury', newAddress: f.liquidityTreasury.address },
    );
    const { token, pool } = await launch(f);

    expect(await jettonBalance(f, token, f.creator.address)).toEqual(CREATOR_ALLOCATION);
    expect(await jettonBalance(f, token, f.liquidityTreasury.address)).toEqual(LIQUIDITY_ALLOCATION);
    expect(await jettonBalance(f, token, pool.address)).toEqual(BUYER_ALLOCATION);
  });

  it('uses updated treasury wallets for old presales before TON payout while keeping token routing already settled', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);
    const newTonTreasury = await f.blockchain.treasury('new-platform-ton');
    const newTokenTreasury = await f.blockchain.treasury('new-platform-token');
    const newLiquidityTreasury = await f.blockchain.treasury('new-liquidity');

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));

    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTonTreasury', newAddress: newTonTreasury.address });
    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTokenTreasury', newAddress: newTokenTreasury.address });
    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdateLiquidityTreasury', newAddress: newLiquidityTreasury.address });

    f.blockchain.now = f.endTime + 1;
    const claim = await pool.send(f.creator.getSender(), { value: toNano('1') }, { $$type: 'CreatorClaimTreasury' });
    const creatorPayout = getTxValue(claim.transactions, pool.address, f.treasury.address);

    expect(claim.transactions).toHaveTransaction({ from: pool.address, to: newTonTreasury.address, value: toNano('0.5'), success: true });
    expect(claim.transactions).toHaveTransaction({ from: pool.address, to: newLiquidityTreasury.address, value: toNano('3'), success: true });
    expect(creatorPayout).not.toBeNull();
    expect(creatorPayout!).toEqual(toNano('6.49'));
    expect(await jettonBalance(f, token, f.platformTonTreasury.address)).toEqual(PLATFORM_TOKEN_TON_SHARE);
    expect(await jettonBalance(f, token, f.platformTokenTreasury.address)).toEqual(PLATFORM_TOKEN_TOKEN_SHARE);
    expect(await jettonBalanceOrZero(f, token, newTonTreasury.address)).toEqual(0n);
    expect(await jettonBalanceOrZero(f, token, newTokenTreasury.address)).toEqual(0n);
    expect(await jettonBalanceOrZero(f, token, newLiquidityTreasury.address)).toEqual(0n);
  });

  it('calculates creator treasury after platform TON fee and liquidity TON share', async () => {
    const f = await fixture();
    const { pool } = await launch(f);
    f.blockchain.now = f.startTime + 1;
    const claim = await contribute(f, pool, f.user, toNano('20'));
    const state = await pool.getGetState();
    const creatorPayout = getTxValue(claim.transactions, pool.address, f.treasury.address);

    expect(creatorPayout).not.toBeNull();
    expect(creatorPayout!).toEqual(toNano('18.99'));
    expect(state.platformTonFee).toEqual(toNano('1'));
    expect(state.liquidityTon).toEqual(toNano('6'));
    expect(state.creatorClaimable).toEqual(toNano('13'));
  });

  it('contribution before start fails and hard cap refunds excess', async () => {
    const f = await fixture();
    const { pool } = await launch(f);

    const early = await contribute(f, pool, f.user, toNano('1'));
    expect(early.transactions).toHaveTransaction({ from: f.user.address, to: pool.address, success: false });

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('19'));
    const capped = await contribute(f, pool, f.user2, toNano('5'));

    expect(capped.transactions).toHaveTransaction({ from: pool.address, to: f.user2.address, success: true });
    expect((await pool.getGetState()).totalRaised).toEqual(toNano('20'));
    expect(await pool.getGetContribution(f.user2.address)).toEqual(toNano('1'));
  });

  it('ends automatically when a contribution fills the hard cap', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);

    f.blockchain.now = f.startTime + 1;
    const fill = await contribute(f, pool, f.user, toNano('20'));

    const state = await pool.getGetState();
    const claim = await pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    const creatorPayout = getTxValue(fill.transactions, pool.address, f.treasury.address);

    expect(state.totalRaised).toEqual(toNano('20'));
    expect(state.finalized).toBe(true);
    expect(fill.transactions).toHaveTransaction({ from: pool.address, to: f.platformTonTreasury.address, value: toNano('1'), success: true });
    expect(creatorPayout).not.toBeNull();
    expect(creatorPayout!).toEqual(toNano('18.99'));
    expect(claim.transactions).toHaveTransaction({ from: pool.address, success: true });
    expect(await jettonBalance(f, token, pool.address)).toEqual(BUYER_ALLOCATION - 20_000_000_000_000_000n);
  });

  it('lets the creator or factory owner end a soft-cap sale early as successful', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));

    const end = await pool.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'EndPresaleEarly' });
    const state = await pool.getGetState();
    const claim = await pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    const creatorPayout = getTxValue(end.transactions, pool.address, f.treasury.address);

    expect(end.transactions).toHaveTransaction({ from: f.owner.address, to: pool.address, success: true });
    expect(end.transactions).toHaveTransaction({ from: pool.address, to: f.platformTonTreasury.address, value: toNano('0.5'), success: true });
    expect(creatorPayout).not.toBeNull();
    expect(creatorPayout!).toEqual(toNano('9.49'));
    expect(state.finalized).toBe(true);
    expect(claim.transactions).toHaveTransaction({ from: pool.address, success: true });
    expect(await jettonBalance(f, token, f.user.address)).toEqual(10_000_000_000_000_000n);
  });

  it('lets the creator cancel a pre-soft-cap sale early and unlock refunds', async () => {
    const f = await fixture();
    const { pool } = await launch(f);

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('2'));

    const cancel = await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'CancelPresaleEarly' });
    const refund = await pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });
    const creatorClaim = await pool.send(f.creator.getSender(), { value: toNano('1') }, { $$type: 'CreatorClaimTreasury' });
    const state = await pool.getGetState();

    expect(cancel.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: true });
    expect(state.failed).toBe(true);
    expect(state.cancelled).toBe(true);
    expect(refund.transactions).toHaveTransaction({ from: pool.address, to: f.user.address, success: true });
    expect(creatorClaim.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: false });
  });

  it('treats a soft-cap sale as successful once end time elapses', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    const claim = await pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });

    expect(claim.transactions).toHaveTransaction({ from: pool.address, success: true });
    expect(claim.transactions).toHaveTransaction({ from: pool.address, to: f.treasury.address, success: true });
    expect(claim.transactions).toHaveTransaction({ from: pool.address, to: f.platformTonTreasury.address, success: true });
    expect(await jettonBalance(f, token, f.user.address)).toEqual(10_000_000_000_000_000n);
  });

  it('burns unsold presale tokens without touching creator, liquidity, or platform token allocations', async () => {
    const f = await fixture();
    const { token, pool } = await launch(f);

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'EndPresaleEarly' });

    const beforeCreator = await jettonBalance(f, token, f.creator.address);
    const beforePlatformTon = await jettonBalance(f, token, f.platformTonTreasury.address);
    const beforePlatformToken = await jettonBalance(f, token, f.platformTokenTreasury.address);
    const burn = await pool.send(f.creator.getSender(), { value: toNano('0.2') }, { $$type: 'BurnUnsoldTokens' });
    const state = await pool.getGetState();

    expect(burn.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: true });
    expect(state.burnedTokens).toEqual(BUYER_ALLOCATION - 10_000_000_000_000_000n);
    expect(state.finalized).toBe(true);
    expect(await jettonBalance(f, token, pool.address)).toEqual(10_000_000_000_000_000n);
    expect(await jettonBalance(f, token, f.creator.address)).toEqual(beforeCreator);
    expect(await jettonBalance(f, token, f.platformTonTreasury.address)).toEqual(beforePlatformTon);
    expect(await jettonBalance(f, token, f.platformTokenTreasury.address)).toEqual(beforePlatformToken);
  });

  it('allows only the creator or factory owner to burn unsold presale tokens', async () => {
    const f = await fixture();
    const { pool } = await launch(f);

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('10'));
    await pool.send(f.creator.getSender(), { value: toNano('0.05') }, { $$type: 'EndPresaleEarly' });

    const outsider = await pool.send(f.user2.getSender(), { value: toNano('0.2') }, { $$type: 'BurnUnsoldTokens' });
    const owner = await pool.send(f.owner.getSender(), { value: toNano('0.2') }, { $$type: 'BurnUnsoldTokens' });

    expect(outsider.transactions).toHaveTransaction({ from: f.user2.address, to: pool.address, success: false });
    expect(owner.transactions).toHaveTransaction({ from: f.owner.address, to: pool.address, success: true });
  });

  it('treats a below-soft-cap sale as failed once end time elapses', async () => {
    const f = await fixture();
    const { pool } = await launch(f);

    f.blockchain.now = f.startTime + 1;
    await contribute(f, pool, f.user, toNano('2'));
    f.blockchain.now = f.endTime + 1;

    const refund = await pool.send(f.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });
    const creatorClaim = await pool.send(f.creator.getSender(), { value: toNano('1') }, { $$type: 'CreatorClaimTreasury' });

    expect(refund.transactions).toHaveTransaction({ from: pool.address, to: f.user.address, success: true });
    expect(creatorClaim.transactions).toHaveTransaction({ from: f.creator.address, to: pool.address, success: false });
  });

  it('claim and refund flows still work normally', async () => {
    const successFixture = await fixture();
    const { token, pool } = await launch(successFixture);
    successFixture.blockchain.now = successFixture.startTime + 1;
    await contribute(successFixture, pool, successFixture.user, toNano('10'));
    successFixture.blockchain.now = successFixture.endTime + 1;

    const claim = await pool.send(successFixture.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    const secondClaim = await pool.send(successFixture.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    const refundAfterSuccess = await pool.send(successFixture.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });

    expect(claim.transactions).toHaveTransaction({ from: pool.address, success: true });
    expect(await jettonBalance(successFixture, token, successFixture.user.address)).toEqual(10_000_000_000_000_000n);
    expect(secondClaim.transactions).toHaveTransaction({ from: successFixture.user.address, to: pool.address, success: false });
    expect(refundAfterSuccess.transactions).toHaveTransaction({ from: successFixture.user.address, to: pool.address, success: false });

    const failedFixture = await fixture();
    const { pool: failedPool } = await launch(failedFixture);
    failedFixture.blockchain.now = failedFixture.startTime + 1;
    await contribute(failedFixture, failedPool, failedFixture.user, toNano('2'));
    failedFixture.blockchain.now = failedFixture.endTime + 1;
    const refund = await failedPool.send(failedFixture.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });
    const secondRefund = await failedPool.send(failedFixture.user.getSender(), { value: toNano('0.05') }, { $$type: 'Refund' });

    expect(refund.transactions).toHaveTransaction({ from: failedPool.address, to: failedFixture.user.address, success: true });
    expect(secondRefund.transactions).toHaveTransaction({ from: failedFixture.user.address, to: failedPool.address, success: false });
  });

  it('existing presales remain functional after factory config changes', async () => {
    const f = await fixture();
    const first = await launch(f);

    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTonFeeBps', newFeeBps: 400n });
    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTokenFeeBps', newFeeBps: 200n });
    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'PauseNewLaunches' });
    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UnpauseNewLaunches' });

    f.blockchain.now = f.startTime + 1;
    await contribute(f, first.pool, f.user, toNano('10'));
    f.blockchain.now = f.endTime + 1;

    const claim = await first.pool.send(f.user.getSender(), { value: toNano('0.2') }, { $$type: 'ClaimTokens' });
    expect(claim.transactions).toHaveTransaction({ from: first.pool.address, success: true });
  });

  it('allows only the owner to update treasuries and transfer ownership', async () => {
    const f = await fixture();
    const outsiderUpdate = await f.factory.send(
      f.user.getSender(),
      { value: toNano('0.05') },
      { $$type: 'UpdatePlatformTonTreasury', newAddress: f.user.address },
    );
    expect(outsiderUpdate.transactions).toHaveTransaction({
      from: f.user.address,
      to: f.factory.address,
      success: false,
    });

    await f.factory.send(
      f.owner.getSender(),
      { value: toNano('0.05') },
      { $$type: 'TransferOwnership', newOwner: f.user.address },
    );
    const newConfig = await f.factory.getGetFactoryConfig();
    expect(newConfig.owner).toEqualAddress(f.user.address);

    const oldOwnerUpdate = await f.factory.send(
      f.owner.getSender(),
      { value: toNano('0.05') },
      { $$type: 'UpdatePlatformTokenTreasury', newAddress: f.owner.address },
    );
    expect(oldOwnerUpdate.transactions).toHaveTransaction({
      from: f.owner.address,
      to: f.factory.address,
      success: false,
    });

    const newOwnerUpdate = await f.factory.send(
      f.user.getSender(),
      { value: toNano('0.05') },
      { $$type: 'UpdatePlatformTokenTreasury', newAddress: f.user2.address },
    );
    expect(newOwnerUpdate.transactions).toHaveTransaction({
      from: f.user.address,
      to: f.factory.address,
      success: true,
    });
  });

  it('pauses and unpauses new launches globally for the owner only', async () => {
    const f = await fixture();

    const outsiderPause = await f.factory.send(
      f.user.getSender(),
      { value: toNano('0.05') },
      { $$type: 'PauseNewLaunches' },
    );
    expect(outsiderPause.transactions).toHaveTransaction({
      from: f.user.address,
      to: f.factory.address,
      success: false,
    });

    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'PauseNewLaunches' });
    const pausedLaunch = await f.factory.send(
      f.creator.getSender(),
      { value: toNano('1') },
      launchConfig(f, { name: 'Paused', symbol: 'PAUS' }),
    );
    expect(pausedLaunch.transactions).toHaveTransaction({
      from: f.creator.address,
      to: f.factory.address,
      success: false,
    });

    await f.factory.send(f.owner.getSender(), { value: toNano('0.05') }, { $$type: 'UnpauseNewLaunches' });
    const resumedLaunch = await f.factory.send(
      f.creator.getSender(),
      { value: toNano('1') },
      launchConfig(f, { name: 'Resumed', symbol: 'RSMD' }),
    );
    expect(resumedLaunch.transactions).toHaveTransaction({
      from: f.creator.address,
      to: f.factory.address,
      success: true,
    });
  });

  it('manifest and metadata files stay production-ready', async () => {
    const manifest = JSON.parse(readFileSync('public/tonconnect-manifest.json', 'utf8'));
    const metadata = JSON.parse(readFileSync('public/default-token-metadata.json', 'utf8'));

    expect(manifest.url).toBe('https://tonpad.org');
    expect(manifest.iconUrl).toBe('https://tonpad.org/icon.png');
    expect(metadata.image).toBe('https://tonpad.org/icon.png');
    expect(metadata.name).toBeTruthy();
    expect(metadata.symbol).toBeTruthy();
  });
});
