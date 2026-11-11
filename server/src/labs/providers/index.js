import { DockerLabProvider } from '../docker/dockerProvider.js';
import { PracticeLabProvider } from '../practice/practiceProvider.js';
import { VpsLabProvider } from '../vps/vpsProvider.js';
import env from '../../config/env.js';

const registry = new Map();

/**
 * Registers a provider class. Docker is the production provider. The legacy
 * container-less practice provider stays registered only so sessions created
 * before the real-terminal change can still be stopped/deprovisioned.
 */
export function registerProvider(Provider) {
  return registry.set(Provider.providerName, new Provider());
}

registerProvider(DockerLabProvider);
// Legacy only: new sessions never select this provider, but sessions created
// before the real-terminal change still need it to serve their terminal and to
// be stopped/deprovisioned.
registerProvider(PracticeLabProvider);
// Real VPS labs: selected only for labs with lab_mode = 'vps' (see
// getProviderForLab below). Sessions are provisioned asynchronously by
// labService through the VPS-Reselling gateway.
registerProvider(VpsLabProvider);

/** Returns the active provider instance (LAB_PROVIDER env, default "docker"). */
export function getProvider(name = env.labs.provider) {
  const provider = registry.get(String(name).toLowerCase());
  if (!provider) throw new Error(`Unknown lab provider "${name}". Registered: ${[...registry.keys()].join(', ')}`);
  return provider;
}

/**
 * Picks the provider for a lab.
 *
 * Every lab, guided practice, open-to-all practice and real assessment, runs
 * in the configured real-lab provider (`LAB_PROVIDER`, "docker" in production
 * and "mock" in automated tests). `labs.is_practice` now only controls access
 * and grading; it must never switch a lab to the simulated shell. The one
 * exception is `lab_mode = 'vps'`: those labs run on a dedicated cloud server
 * and always use the vps provider.
 */
export function getProviderForLab(lab, { fallback = env.labs.provider } = {}) {
  if (lab && lab.lab_mode === 'vps') return getProvider('vps');
  return getProvider(fallback);
}

/** Provider name that will be recorded on a new session for this lab. */
export function providerNameForLab(lab, { fallback = env.labs.provider } = {}) {
  return getProviderForLab(lab, { fallback }).name;
}

export function listProviders() {
  return [...registry.values()].map((provider) => provider.name);
}

export default getProvider;
