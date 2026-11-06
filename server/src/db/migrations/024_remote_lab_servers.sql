-- 024_remote_lab_servers.sql
-- Extend lab_servers for remote Lab Agents and add monitoring/events + atomic capacity.

ALTER TABLE lab_servers
  ADD COLUMN IF NOT EXISTS server_type VARCHAR(20) NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS agent_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS agent_secret_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS agent_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS agent_version VARCHAR(64),
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS docker_available BOOLEAN,
  ADD COLUMN IF NOT EXISTS cpu_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS memory_used_mb INTEGER,
  ADD COLUMN IF NOT EXISTS memory_total_mb INTEGER,
  ADD COLUMN IF NOT EXISTS disk_used_gb NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS disk_total_gb NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS running_containers INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_sessions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_metrics_at TIMESTAMPTZ;

-- Event/audit trail for remote servers.
CREATE TABLE IF NOT EXISTS lab_server_events (
  id BIGSERIAL PRIMARY KEY,
  server_id BIGINT REFERENCES lab_servers(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'info',
  message TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_server_events_server_idx ON lab_server_events(server_id, created_at DESC);

-- Capacity safety: never exceed max_sessions.
-- (Enforced in application via atomic UPDATE ... WHERE active_sessions < max_sessions.)
CREATE INDEX IF NOT EXISTS lab_servers_status_type_idx ON lab_servers(status, server_type);
