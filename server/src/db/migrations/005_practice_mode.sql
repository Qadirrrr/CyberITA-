-- Practice mode content and per-learner simulated terminal state.
ALTER TABLE lab_steps
  ADD COLUMN IF NOT EXISTS practice_command TEXT,
  ADD COLUMN IF NOT EXISTS practice_output TEXT,
  ADD COLUMN IF NOT EXISTS practice_explanation TEXT;

CREATE TABLE IF NOT EXISTS lab_practice_sessions (
  id               BIGSERIAL PRIMARY KEY,
  lab_id           BIGINT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cwd              VARCHAR(300) NOT NULL DEFAULT '/home/student',
  fs_state         JSONB NOT NULL DEFAULT '{}',
  history          JSONB NOT NULL DEFAULT '[]',
  completed_steps  JSONB NOT NULL DEFAULT '[]',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reset_at         TIMESTAMPTZ,
  UNIQUE (lab_id, user_id)
);

CREATE INDEX IF NOT EXISTS lab_practice_sessions_user_idx
  ON lab_practice_sessions(user_id, lab_id);
