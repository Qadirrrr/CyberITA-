-- Remove unused legacy tables
-- ----------------------------
-- The original schema (001) created a standalone assignments system and a
-- quiz system. Assignments were replaced by labs (a published lab with a
-- due date is the assignment) and quizzes were never wired into the app:
-- no server or client code references these tables and all of them are
-- empty. Children are dropped before their parents.

DROP TABLE IF EXISTS assignment_submissions;
DROP TABLE IF EXISTS quiz_attempts;
DROP TABLE IF EXISTS quiz_questions;
DROP TABLE IF EXISTS assignments;
DROP TABLE IF EXISTS quizzes;
