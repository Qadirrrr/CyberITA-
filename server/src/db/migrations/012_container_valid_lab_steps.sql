-- Lab content alignment for real container labs.
--
-- The lab runtime image runs unprivileged containers without systemd, so
-- `systemctl`-based steps can never succeed there. Replace them with the
-- container-valid equivalents an operator would actually use to check the
-- same thing. Guarded by exact matches so the migration is idempotent and
-- never overwrites instructor edits that already changed the command.

-- Lab 2: Account and Service Permission Audit
UPDATE lab_steps
SET expected_command = 'pg_isready', hint = 'Use the PostgreSQL client readiness tool to probe a database service.'
WHERE lab_id = 2 AND expected_command = 'systemctl status postgresql';

-- Lab 3: Container Host Readiness Check
UPDATE lab_steps
SET expected_command = 'ls -la /var/run/docker.sock',
    hint = 'Labs run inside an unprivileged container, so check whether a Docker socket is even mounted.'
WHERE lab_id = 3 AND expected_command = 'systemctl status docker';

-- Lab 4: Server Baseline Verification
UPDATE lab_steps
SET expected_command = 'cat /etc/resolv.conf',
    hint = 'Read the resolver configuration to identify the DNS servers this host uses.'
WHERE lab_id = 4 AND expected_command = 'systemctl status dns';
