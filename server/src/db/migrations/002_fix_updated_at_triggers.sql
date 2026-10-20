-- Remove the updated_at trigger from tables that do not have an updated_at column.
DROP TRIGGER IF EXISTS set_updated_at ON quizzes;
DROP TRIGGER IF EXISTS set_updated_at ON lab_sessions;
