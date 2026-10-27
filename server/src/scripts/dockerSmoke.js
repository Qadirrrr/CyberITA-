import { DockerLabProvider } from '../labs/docker/dockerProvider.js';
import env from '../config/env.js';

const provider = new DockerLabProvider();
const availability = await provider.isAvailable();

if (!availability.ok) {
  console.error(`Docker labs are unavailable: ${availability.reason}`);
  process.exitCode = 1;
} else {
  console.log(availability.reason);
  const lab = {
    id: 0,
    title: 'Docker smoke test',
    initial_cwd: '/home/student',
    terminal_welcome: '',
    initial_files: {},
    container_image: env.labs.docker.image,
    network_enabled: true,
  };
  let session = null;

  try {
    const descriptor = await provider.provision({
      lab,
      user: { id: 0, full_name: 'Smoke Test' },
    });
    session = {
      instance_id: descriptor.instanceId,
      cwd: descriptor.cwd,
      fs_state: descriptor.fsState,
    };
    console.log(`Provisioned ${descriptor.instanceId} as ${descriptor.fsState.shellUser}@${descriptor.fsState.hostname} with ${descriptor.fsState.shell}`);

    const terminal = provider.createTerminal(session, lab);
    const result = await terminal.execute(
      "printf 'uid=%s\\n' \"$(id -u)\" && printf 'user=%s\\n' \"$(id -un)\" && printf 'env=%s\\n' \"$USER\" "
      + "&& pwd && printf smoke > smoke.txt && cat smoke.txt && rm smoke.txt "
      + "&& apt-get -s install nmap >/dev/null 2>&1 && echo apt-ok"
    );
    process.stdout.write(result.output);
    if (result.exitCode !== 0) throw new Error(`Command exited with code ${result.exitCode}`);
    const expected = descriptor.fsState.shellUser;
    for (const needle of ['uid=0', `user=${expected}`, `env=${expected}`, '/home/student', 'smoke', 'apt-ok']) {
      if (!result.output.includes(needle)) {
        throw new Error(`The smoke test command produced unexpected output (missing "${needle}").`);
      }
    }
    console.log('\nDocker lab smoke test passed.');
  } catch (error) {
    console.error(`Docker lab smoke test failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (session) {
      try {
        await provider.deprovision(session);
        console.log('Removed the smoke-test container.');
      } catch (error) {
        console.error(`Could not remove the smoke-test container: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}
