-- Admin platform control: content moderation and operating policies

CREATE TABLE IF NOT EXISTS content_reports (
  id              BIGSERIAL PRIMARY KEY,
  reporter_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type    VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'course', 'lab')),
  content_id      BIGINT NOT NULL,
  reason          VARCHAR(40) NOT NULL
                  CHECK (reason IN ('spam', 'misleading', 'plagiarism', 'offensive', 'broken', 'other')),
  details         TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_content ON content_reports(content_type, content_id);

INSERT INTO platform_settings (key, value, description)
VALUES
  ('enrollment', '{"allowSelfEnroll": true, "allowLearnerUnenroll": true, "certificateAutoIssue": true}', 'Course enrollment and certificate rules'),
  ('security', '{"sessionTimeoutHours": 12, "refreshTokenDays": 7, "requireStrongPasswords": true, "restrictInstructorPublishing": true}', 'Access control and account security policies')
ON CONFLICT (key) DO NOTHING;
