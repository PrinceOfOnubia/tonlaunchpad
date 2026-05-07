import { Address, toNano } from '@ton/core';
import { PresalePool } from '../build/PresalePool/PresalePool_PresalePool';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
  const owner = provider.sender().address;
  if (!owner) {
    throw new Error('Deploy wallet address is unavailable');
  }

  const pool = provider.open(
    await PresalePool.fromInit(
      owner,
      Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
      Address.parse('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'),
      owner,
      owner,
      1_000_000_000n,
      toNano('10'),
      toNano('20'),
      toNano('1'),
      toNano('5'),
      BigInt(Math.floor(Date.now() / 1000) + 600),
      BigInt(Math.floor(Date.now() / 1000) + 86_400),
      BigInt(Math.floor(Date.now() / 1000) + 90_000),
      true,
      2000n,
      500n,
      600n,
      BigInt(Math.floor(Date.now() / 1000) + 90_000),
    ),
  );

  await pool.send(provider.sender(), { value: toNano('0.05') }, { $$type: 'Deploy', queryId: 0n });
  await provider.waitForDeploy(pool.address);
  console.log('PresalePool deployed at', pool.address.toString());
}
