import { toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { LaunchpadFactory } from '../build/Launchpad/Launchpad_LaunchpadFactory';
import { DexAdapter } from '../build/Launchpad/Launchpad_DexAdapter';

export async function run(provider: NetworkProvider) {
  const owner = provider.sender().address;
  if (!owner) {
    throw new Error('Deploy wallet address is unavailable');
  }

  const factory = provider.open(await LaunchpadFactory.fromInit(owner));
  await factory.send(provider.sender(), { value: toNano('0.2') }, { $$type: 'Deploy', queryId: 0n });
  await provider.waitForDeploy(factory.address);

  const dexAdapter = provider.open(await DexAdapter.fromInit(owner));
  await dexAdapter.send(provider.sender(), { value: toNano('0.2') }, { $$type: 'Deploy', queryId: 0n });
  await provider.waitForDeploy(dexAdapter.address);

  console.log('LaunchpadFactory deployed at', factory.address.toString());
  console.log('DexAdapter deployed at', dexAdapter.address.toString());
}
