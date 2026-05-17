-- v2 cleanup — drop the per-project canned-prompt columns that fed the
-- Commit + Push ActionsRow buttons (removed in Phase 5 Task 6). The columns
-- are nullable and were unreachable from the UI after Phase 5, so dropping
-- them is a clean cleanup. No data needs preservation.

ALTER TABLE projects DROP COLUMN default_commit_prompt;
ALTER TABLE projects DROP COLUMN default_push_prompt;
