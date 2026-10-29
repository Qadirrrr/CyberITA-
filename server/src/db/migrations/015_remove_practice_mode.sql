-- Simulated practice mode was removed: every lab is a real, isolated Docker
-- container, so the practice tables/columns and the old provider defaults go
-- away. Harmless on databases that never had practice mode.
ALTER TABLE lab_steps DROP COLUMN IF EXISTS practice_command;
ALTER TABLE lab_steps DROP COLUMN IF EXISTS practice_output;
ALTER TABLE lab_steps DROP COLUMN IF EXISTS practice_explanation;

DROP TABLE IF EXISTS lab_practice_sessions;

-- Labs always run on a real provider now.
ALTER TABLE labs ALTER COLUMN provider_hint SET DEFAULT 'docker';
ALTER TABLE lab_sessions ALTER COLUMN provider SET DEFAULT 'docker';
