-- Real VPS lab mode
-- ------------------
-- Third delivery mode for labs:
--   * practice : guided lab with steps, hints and automatic step verification.
--   * real     : question-only assessment, screenshot evidence, instructor review.
--   * vps      : same question-only assessment semantics as `real`, but the
--                learner works on a dedicated cloud server provisioned for the
--                session through the VPS-Reselling internal labs gateway.
--
-- `vps_profile` names the fixed gateway profile the session is provisioned
-- with (ubuntu-basic, debian-admin, network-firewall, server-hardening,
-- penetration-testing). Learners never choose provider settings themselves.

ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS vps_profile VARCHAR(60) NOT NULL DEFAULT 'ubuntu-basic';

ALTER TABLE labs DROP CONSTRAINT IF EXISTS labs_lab_mode_check;
ALTER TABLE labs
  ADD CONSTRAINT labs_lab_mode_check CHECK (lab_mode IN ('practice', 'real', 'vps'));
