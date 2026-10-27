-- Real terminal for every lab session.
--
-- Learners now get full root permission inside their disposable container so
-- they can install any package and use professional tooling, and the shell
-- shows their own name / student id. Package installation needs outbound
-- network access, so labs now default to networking enabled. Instructors can
-- still switch it off per lab from the lab editor.
--
-- The container stays isolated from the host: no --privileged, no host mounts,
-- no Docker socket, and CPU/memory/process limits still apply.

ALTER TABLE labs ALTER COLUMN network_enabled SET DEFAULT TRUE;
UPDATE labs SET network_enabled = TRUE WHERE network_enabled = FALSE;
