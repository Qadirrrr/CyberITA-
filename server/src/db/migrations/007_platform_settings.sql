-- Migration 007: Platform settings and administrative configuration

CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INT REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_settings (key, value, description)
VALUES
  ('general', '{"platformName": "CyberITA+", "supportEmail": "support@cyberita.local", "maintenanceMode": false, "registrationOpen": true}', 'General platform settings'),
  ('labs', '{"defaultTimeoutMinutes": 60, "maxActiveLabsPerUser": 1, "autoCleanupIntervalMinutes": 5, "requireScreenshots": true}', 'Practical lab runtime configuration'),
  ('content', '{"blogAutoPublish": false, "requireReportReview": true, "certificateAutoIssue": true}', 'Content review and editorial policies')
ON CONFLICT (key) DO NOTHING;
