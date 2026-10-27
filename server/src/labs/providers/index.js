import { MockLabProvider } from '../mock/mockProvider.js';
import { DockerLabProvider } from '../docker/dockerProvider.js';
import env from '../../config/env.js';

const registry = new Map();
const register = (Provider) => registry.set(Provider.providerName, new Provider());

// Mock is available for automated tests and the simulated practice mode only.
register(MockLabProvider);
register(DockerLabProvider);

/** Returns the active provider instance (LAB_PROVIDER env, default "docker"). */
export function getProvider(name = env.labs.provider) {
  const provider = registry.get(String(name).toLowerCase());
  if (!provider) throw new Error(`Unknown lab provider "${name}". Registered: ${[...registry.keys()].join(', ')}`);
  return provider;
}

export function listProviders() {
  return [...registry.values()].map((provider) => provider.name);
}

export default getProvider;
