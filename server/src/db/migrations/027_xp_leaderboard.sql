-- XP points and leaderboard
-- --------------------------
-- Students earn XP for verified lab steps (the step's own points), for
-- completing a guided lab (+50), for an approved real/VPS lab submission
-- (+100) and for completing a course (+150). xp_events is the ledger: one
-- row per award, unique per (user, source) so nothing can be earned twice.
-- users.xp_points is the cached total the leaderboard reads.

CREATE TABLE IF NOT EXISTS xp_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points      INT NOT NULL,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('step', 'lab', 'submission', 'course')),
  source_id   BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS xp_events_user_idx ON xp_events(user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_points INT NOT NULL DEFAULT 0;

-- Backfill from work students already did, so the leaderboard starts with
-- real standings instead of an empty board.
INSERT INTO xp_events (user_id, points, source_type, source_id)
SELECT DISTINCT ON (sess.user_id, p.step_id) sess.user_id, st.points, 'step', p.step_id
FROM lab_step_progress p
JOIN lab_sessions sess ON sess.id = p.session_id
JOIN lab_steps st ON st.id = p.step_id
ON CONFLICT DO NOTHING;

INSERT INTO xp_events (user_id, points, source_type, source_id)
SELECT sess.user_id, 50, 'lab', st.lab_id
FROM lab_step_progress p
JOIN lab_sessions sess ON sess.id = p.session_id
JOIN lab_steps st ON st.id = p.step_id AND st.is_optional = FALSE
GROUP BY sess.user_id, st.lab_id
HAVING COUNT(DISTINCT p.step_id) >= (
  SELECT COUNT(*) FROM lab_steps WHERE lab_id = st.lab_id AND is_optional = FALSE
)
ON CONFLICT DO NOTHING;

INSERT INTO xp_events (user_id, points, source_type, source_id)
SELECT user_id, 100, 'submission', id
FROM lab_submissions
WHERE status = 'approved'
ON CONFLICT DO NOTHING;

INSERT INTO xp_events (user_id, points, source_type, source_id)
SELECT user_id, 150, 'course', course_id
FROM certificates
ON CONFLICT DO NOTHING;

UPDATE users u
SET xp_points = COALESCE((SELECT SUM(points) FROM xp_events e WHERE e.user_id = u.id), 0);
