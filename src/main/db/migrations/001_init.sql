-- Initial schema. Mirrors spec §3 exactly. Indexes follow each table.
-- All TEXT columns use NULL semantics (no NOT NULL unless required by spec).

-- NOTE: This schema strengthens several spec §3 columns from nullable to
-- NOT NULL. Timestamps (created_at / updated_at / sent_at) and required
-- foreign keys (conversations.project_id, turns.conversation_id) are
-- ALWAYS set by the DAOs at insert time — making them NOT NULL surfaces
-- DAO bugs at the DB layer rather than letting silent NULLs propagate.
-- If a future use case needs a "draft" row without these fields, lift the
-- constraint in a new migration; do not edit this one.

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  config_dir TEXT NOT NULL,
  -- api_key_ref: forward-looking per ADR-018 — opaque keychain reference for
  -- the account's ANTHROPIC_API_KEY. Empty/null until Phase 6 wires real
  -- key storage.
  api_key_ref TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  default_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  default_model TEXT,
  default_breadth TEXT,
  default_format TEXT,
  default_commit_prompt TEXT,
  default_push_prompt TEXT,
  notes TEXT,
  always_include_files_json TEXT,
  relevant_skill_ids_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL,
  favorited INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER
);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  cc_session_id TEXT,
  title TEXT,
  model TEXT,
  breadth TEXT,
  format TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  summary_updated_at INTEGER,
  parent_conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  branched_at_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  archived_at INTEGER
);

CREATE TABLE turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  original_prompt TEXT,
  geared_prompt TEXT,
  response_text TEXT,
  original_tokens INTEGER,
  geared_tokens INTEGER,
  response_tokens INTEGER,
  haiku_meta_tokens INTEGER,
  model_used TEXT,
  feedback TEXT,
  critique_flags_json TEXT,
  status TEXT,
  sent_at INTEGER NOT NULL
);

CREATE TABLE drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(conversation_id)
);

CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  description TEXT,
  category TEXT,
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes (spec §3)
CREATE INDEX idx_conversations_project_updated ON conversations(project_id, updated_at DESC);
CREATE INDEX idx_turns_conversation_sent ON turns(conversation_id, sent_at ASC);
CREATE INDEX idx_skills_favorited_hidden_name ON skills(favorited DESC, hidden ASC, name);
CREATE INDEX idx_turns_sent_at ON turns(sent_at);
CREATE INDEX idx_turns_feedback ON turns(feedback);
CREATE INDEX idx_drafts_conversation ON drafts(conversation_id);
