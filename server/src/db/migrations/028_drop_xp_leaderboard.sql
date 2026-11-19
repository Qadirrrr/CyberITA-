-- Remove XP points and the leaderboard (feature reverted by request).
-- Drops the ledger added by 027_xp_leaderboard.sql and the cached total.

DROP TABLE IF EXISTS xp_events;

ALTER TABLE users DROP COLUMN IF EXISTS xp_points;
