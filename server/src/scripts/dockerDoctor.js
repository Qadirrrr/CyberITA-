import env from '../config/env.js';
import { DockerLabProvider } from '../labs/docker/dockerProvider.js';
import { resolveDockerBinary, dockerBinaryHint } from '../labs/docker/dockerBinary.js';

/**
 * Prints everything needed to diagnose "Docker CLI is not installed or is not
 * on PATH" and similar lab-startup failures on a server.
 *
 * Run from /server:  npm run lab:doctor
 */
const lines = [];
const say = (line = '') => lines.push(line);

say('CyberITA+ lab runtime doctor');
say('---------------------------');
say(`Node           : ${process.version}`);
say(`Platform       : ${process.platform} ${process.arch}`);
say(`Working dir    : ${process.cwd()}`);
say(`Lab provider   : ${env.labs.provider}`);
say(`Lab image      : ${env.labs.docker.image}`);
say(`Docker host    : ${env.labs.docker.host || '(local socket)'}`);
say(`Network/pull   : ${env.labs.docker.networkEnabled ? 'on' : 'off'} / ${env.labs.docker.pull ? 'on' : 'off'}`);
say();

const resolved = resolveDockerBinary(env.labs.docker.binary);
say(`LAB_DOCKER_BINARY : ${resolved.configured}`);
say(`Resolved binary   : ${resolved.found ? resolved.binary : '(not found)'}`);
say(`Resolved via      : ${resolved.source}`);
say();

if (!resolved.found) {
  say('PROBLEM: the Docker CLI could not be found.');
  say(dockerBinaryHint(resolved));
  say();
  say('Fixes:');
  say('  - Install Docker Engine (Linux) or Docker Desktop (Windows/macOS) on this host.');
  say('  - Make sure the account running the API can run `docker version` without sudo.');
  say('  - For systemd, add: Environment=PATH=/usr/local/bin:/usr/bin:/bin:/snap/bin');
  say('  - Or pin the CLI in server/.env: LAB_DOCKER_BINARY=/usr/bin/docker');
  say('  - If the API itself runs in a container, install the Docker CLI there and mount /var/run/docker.sock.');
  console.log(lines.join('\n'));
  process.exitCode = 1;
} else {
  const provider = new DockerLabProvider();
  const availability = await provider.isAvailable();
  say(`Docker engine     : ${availability.ok ? 'reachable' : 'NOT reachable'}`);
  say(`Detail            : ${availability.reason || '(none)'}`);
  say();

  if (!availability.ok) {
    say('Fixes:');
    say('  - Start Docker: `sudo systemctl start docker` (Linux) or start Docker Desktop.');
    say('  - Check permissions: `sudo usermod -aG docker $USER`, then log out and back in.');
    say('  - For a remote daemon set LAB_DOCKER_HOST (e.g. ssh://labuser@lab-host).');
    console.log(lines.join('\n'));
    process.exitCode = 1;
  } else {
    const inspected = await provider.run(['image', 'inspect', env.labs.docker.image], { timeoutMs: 30000 });
    const present = inspected.exitCode === 0;
    say(`Lab image present : ${present ? 'yes' : 'no'}`);
    if (!present) {
      say();
      say('The image is missing. Build it on this host from /server:');
      say('  npm run lab:image:build');
      say(`  # or let the first session pull it: docker pull ${env.labs.docker.image}`);
      process.exitCode = 1;
    } else {
      say();
      say('Everything looks ready. If labs still fail, check the API log for the');
      say('exact session error and confirm the API user can create containers.');
    }
    console.log(lines.join('\n'));
  }
}

// Keep the output readable even when the process exits non-zero.
