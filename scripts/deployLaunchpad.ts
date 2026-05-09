import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { LaunchpadFactory } = require('../build/Launchpad/Launchpad_LaunchpadFactory');

const DEFAULT_PLATFORM_TOKEN_TREASURY = '0QCOdg8PwR3o9bdyU7yo1n9jO-zcz6HKJ_uVzxsfjMejhjY0';

export async function run(provider: NetworkProvider) {
  const owner = provider.sender().address;
  if (!owner) {
    throw new Error('Deploy wallet address is unavailable');
  }

  const factory = provider.open(await LaunchpadFactory.fromInit(owner));
  await factory.send(provider.sender(), { value: toNano('0.2') }, { $$type: 'Deploy', queryId: BigInt(0) });
  await provider.waitForDeploy(factory.address);

  const platformTokenTreasury = Address.parse(process.env.PLATFORM_TOKEN_TREASURY || DEFAULT_PLATFORM_TOKEN_TREASURY);
  await factory.send(provider.sender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTokenTreasury', newAddress: platformTokenTreasury });

  console.log('LaunchpadFactory deployed at', factory.address.toString());
  console.log('Platform token treasury set to', platformTokenTreasury.toString());
}
