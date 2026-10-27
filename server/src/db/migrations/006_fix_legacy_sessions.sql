-- Migration 006: Reconcile legacy/external provider lab sessions (e.g. legacy 'nova')
-- Ensures legacy or orphaned sessions are marked stopped and their provider normalized.

UPDATE lab_sessions
SET provider = 'docker',
    status = 'stopped',
    ended_at = COALESCE(ended_at, now())
WHERE provider NOT IN ('mock', 'docker');

UPDATE lab_sessions
SET status = 'stopped',
    ended_at = COALESCE(ended_at, now())
WHERE status IN ('running', 'provisioning', 'error')
  AND expires_at IS NOT NULL
  AND expires_at <= now();
