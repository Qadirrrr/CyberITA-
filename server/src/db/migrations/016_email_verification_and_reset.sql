-- Email verification, password reset and login hardening.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verify_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verify_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_email_verify_idx ON users(email_verify_token_hash)
  WHERE email_verify_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_password_reset_idx ON users(password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;

-- Every outgoing email is recorded here. With SMTP configured the row shows
-- sent/failed; without it the row is "logged" and the dev log carries the link.
CREATE TABLE IF NOT EXISTS email_outbox (
  id         BIGSERIAL PRIMARY KEY,
  recipient  VARCHAR(255) NOT NULL,
  subject    VARCHAR(255) NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  kind       VARCHAR(40) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'sent', 'logged', 'failed')),
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_outbox_recipient_idx ON email_outbox(recipient, created_at DESC);

-- Accounts created before verification existed are trusted: backfill them as
-- verified so long-time users are not prompted to verify retroactively.
UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at, now())
  WHERE email_verified_at IS NULL;
