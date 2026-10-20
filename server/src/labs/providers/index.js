import { LabProvider } from '../provider.js';
import { MockLabProvider } from '../mock/mockProvider.js';
import env from '../../config/env.js';

/**
 * Placeholder for the future NOVA VPS integration.
 * Implement provision/deprovision/createTerminal against the NOVA API
 * and register the class below — no other module must change.
 */
export class NovaLabProvider extends LabProvider {
  static providerName = 'nova';
  async isAvailable() {
    return { ok: false, reason: 'NOVA VPS integration is not enabled yet (planned phase).' };
  }
  async provision() {
    throw new Error('NOVA VPS provider is not implemented yet. Set LAB_PROVIDER=mock.');
  }
}

/** Placeholder for a future AWS (EC2/ECS) integration. */
export class AwsLabProvider extends LabProvider {
  static providerName = 'aws';
  async isAvailable() {
    return { ok: false, reason: 'AWS integration is not enabled yet (planned phase).' };
  }
  async provision() {
    throw new Error('AWS provider is not implemented yet. Set LAB_PROVIDER=mock.');
  }
}

/** Placeholder for a future DigitalOcean integration. */
export class DigitalOceanLabProvider extends LabProvider {
  static providerName = 'digitalocean';
  async isAvailable() {
    return { ok: false, reason: 'DigitalOcean integration is not enabled yet (planned phase).' };
  }
  async provision() {
    throw new Error('DigitalOcean provider is not implemented yet. Set LAB_PROVIDER=mock.');
  }
}

/** Placeholder for a future Vultr integration. */
export class VultrLabProvider extends LabProvider {
  static providerName = 'vultr';
  async isAvailable() {
    return { ok: false, reason: 'Vultr integration is not enabled yet (planned phase).' };
  }
  async provision() {
    throw new Error('Vultr provider is not implemented yet. Set LAB_PROVIDER=mock.');
  }
}

const registry = new Map();
const register = (Provider) => registry.set(Provider.providerName, new Provider());

register(MockLabProvider);
register(NovaLabProvider);
register(AwsLabProvider);
register(DigitalOceanLabProvider);
register(VultrLabProvider);

/** Returns the active provider instance (LAB_PROVIDER env, default "mock"). */
export function getProvider(name = env.labs.provider) {
  const provider = registry.get(String(name).toLowerCase());
  if (!provider) throw new Error(`Unknown lab provider "${name}". Registered: ${[...registry.keys()].join(', ')}`);
  return provider;
}

export function listProviders() {
  return [...registry.values()].map((provider) => provider.name);
}

export default getProvider;
