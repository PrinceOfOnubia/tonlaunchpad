import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { createRequire } from 'module';
import 'dotenv/config';

const require = createRequire(import.meta.url);
const { LaunchpadFactory } = require('../build/Launchpad/Launchpad_LaunchpadFactory');

export async function run(provider: NetworkProvider) {
  const factoryAddress = requiredAddress('FACTORY_ADDRESS');
  const platformTonTreasury = requiredAddress('PLATFORM_TON_TREASURY');
  const platformTokenTreasury = requiredAddress('PLATFORM_TOKEN_TREASURY');

  const factory = provider.open(LaunchpadFactory.fromAddress(factoryAddress));

  await factory.send(
    provider.sender(),
    { value: toNano('0.05') },
    { $$type: 'UpdatePlatformTonTreasury', newAddress: platformTonTreasury },
  );

  await factory.send(
    provider.sender(),
    { value: toNano('0.05') },
    { $$type: 'UpdatePlatformTokenTreasury', newAddress: platformTokenTreasury },
  );

  console.log('UPDATED_FACTORY_ADDRESS=' + factoryAddress.toString());
  console.log('Platform TON treasury set to', platformTonTreasury.toString());
  console.log('Platform token treasury set to', platformTokenTreasury.toString());
}

function requiredAddress(
  name: 'FACTORY_ADDRESS' | 'PLATFORM_TON_TREASURY' | 'PLATFORM_TOKEN_TREASURY',
) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return Address.parse(value);
}
