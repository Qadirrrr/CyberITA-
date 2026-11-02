-- Migration 018: Container Monitoring & Lifecycle Events
-- Records real Docker container lifecycle events for admin monitoring and audit trail

CREATE TABLE IF NOT EXISTS container_lifecycle_events (
  id           BIGSERIAL PRIMARY KEY,
  container_id VARCHAR(120) NOT NULL,
  session_id   BIGINT REFERENCES lab_sessions(id) ON DELETE SET NULL,
  user_id      BIGINT REFERENCES users(id) ON DELETE CASCADE,
  lab_id       BIGINT REFERENCES labs(id) ON DELETE CASCADE,
  event        VARCHAR(50) NOT NULL, -- 'created', 'started', 'stopped', 'restarted', 'reset', 'removed', 'cleanup'
  details      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS container_events_container_idx ON container_lifecycle_events(container_id, created_at DESC);
CREATE INDEX IF NOT EXISTS container_events_session_idx ON container_lifecycle_events(session_id);
CREATE INDEX IF NOT EXISTS container_events_user_idx ON container_lifecycle_events(user_id);
CREATE INDEX IF NOT EXISTS container_events_created_idx ON container_lifecycle_events(created_at DESC);

