import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { createRequire } from 'module';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const { LaunchpadFactory } = require('../build/Launchpad/Launchpad_LaunchpadFactory');

export async function run(provider: NetworkProvider) {
  const owner = provider.sender().address;
  if (!owner) {
    throw new Error('Deploy wallet address is unavailable');
  }

  const platformTonTreasury = requiredAddress('PLATFORM_TON_TREASURY');
  const platformTokenTreasury = requiredAddress('PLATFORM_TOKEN_TREASURY');
  const deploymentNonce = BigInt(process.env.DEPLOYMENT_NONCE ?? Date.now());

  const factory = provider.open(await LaunchpadFactory.fromInit(owner, deploymentNonce));
  await factory.send(provider.sender(), { value: toNano('0.2') }, { $$type: 'Deploy', queryId: BigInt(0) });
  await provider.waitForDeploy(factory.address);

  await factory.send(provider.sender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTonTreasury', newAddress: platformTonTreasury });
  await factory.send(provider.sender(), { value: toNano('0.05') }, { $$type: 'UpdatePlatformTokenTreasury', newAddress: platformTokenTreasury });

  console.log('NEW_FACTORY_ADDRESS=' + factory.address.toString());
  console.log('DEPLOYMENT_NONCE=' + deploymentNonce.toString());
  console.log('Platform TON treasury set to', platformTonTreasury.toString());
  console.log('Platform token treasury set to', platformTokenTreasury.toString());
}

function requiredAddress(name: 'PLATFORM_TON_TREASURY' | 'PLATFORM_TOKEN_TREASURY') {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return Address.parse(value);
}
