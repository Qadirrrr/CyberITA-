-- Adds a second-level taxonomy to the course catalog.
-- The navbar groups courses by category -> subcategory -> course.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS subcategory VARCHAR(80) NOT NULL DEFAULT 'General';

CREATE INDEX IF NOT EXISTS courses_taxonomy_idx ON courses (category, subcategory);

-- Give the existing demo catalog a useful starting taxonomy.
UPDATE courses SET subcategory = CASE category
  WHEN 'Linux' THEN 'Linux Administration'
  WHEN 'Networking' THEN 'Network Fundamentals'
  WHEN 'Cybersecurity' THEN 'Security Fundamentals'
  WHEN 'Cloud' THEN 'Cloud Platforms'
  WHEN 'Windows' THEN 'Server Administration'
  WHEN 'Automation' THEN 'Python Automation'
  WHEN 'DevOps' THEN 'CI/CD & Automation'
  WHEN 'Programming' THEN 'Python'
  WHEN 'Databases' THEN 'SQL & PostgreSQL'
  WHEN 'Career' THEN 'Career Growth'
  ELSE 'General'
END
WHERE subcategory = 'General';
