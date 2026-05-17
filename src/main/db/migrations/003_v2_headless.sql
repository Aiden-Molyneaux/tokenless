-- v2 headless refactor — drop every column on conversations + turns that
-- exists only to support the embedded Claude Code PTY, and delete every
-- assistant-role turn row. The whole-DB SQLite backup written by the
-- migration runner before this batch is the v1 recovery artifact.

-- Order matters: delete assistant rows BEFORE dropping the `role` column.
DELETE FROM turns WHERE role = 'assistant';

-- Drop the feedback index before dropping the feedback column.
-- SQLite requires explicit DROP INDEX when an index references a column
-- being dropped (ALTER TABLE DROP COLUMN will error otherwise).
DROP INDEX IF EXISTS idx_turns_feedback;

-- conversations: drop PTY session id, summary, and branching link fields.
ALTER TABLE conversations DROP COLUMN cc_session_id;
ALTER TABLE conversations DROP COLUMN summary;
ALTER TABLE conversations DROP COLUMN summary_updated_at;
ALTER TABLE conversations DROP COLUMN parent_conversation_id;
ALTER TABLE conversations DROP COLUMN branched_at_turn_id;

-- turns: drop assistant-side fields.
ALTER TABLE turns DROP COLUMN role;
ALTER TABLE turns DROP COLUMN response_text;
ALTER TABLE turns DROP COLUMN response_tokens;
ALTER TABLE turns DROP COLUMN feedback;
