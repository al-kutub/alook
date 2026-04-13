-- Migration: Prefixed IDs & Composite Agent Primary Key
-- 1. Prefix workspace IDs with sp_
-- 2. Prefix agent IDs with ag_
-- 3. Add workspace_id to agent_whitelist and emails
-- 4. Recreate tables with composite PK/FKs

PRAGMA foreign_keys = OFF;

-- =========================================================================
-- Step 1: Prefix workspace IDs (sp_)
-- =========================================================================
UPDATE workspace SET id = 'sp_' || id WHERE id NOT LIKE 'sp_%';
UPDATE member SET workspace_id = 'sp_' || workspace_id WHERE workspace_id NOT LIKE 'sp_%';
UPDATE agent_runtime SET workspace_id = 'sp_' || workspace_id WHERE workspace_id NOT LIKE 'sp_%';
UPDATE agent SET workspace_id = 'sp_' || workspace_id WHERE workspace_id NOT LIKE 'sp_%';
UPDATE conversation SET workspace_id = 'sp_' || workspace_id WHERE workspace_id NOT LIKE 'sp_%';
UPDATE agent_task_queue SET workspace_id = 'sp_' || workspace_id WHERE workspace_id NOT LIKE 'sp_%';
UPDATE machine_token SET workspace_id = 'sp_' || workspace_id WHERE workspace_id NOT LIKE 'sp_%';

-- =========================================================================
-- Step 2: Prefix agent IDs (ag_)
-- =========================================================================
UPDATE agent SET id = 'ag_' || id WHERE id NOT LIKE 'ag_%';
UPDATE agent_whitelist SET agent_id = 'ag_' || agent_id WHERE agent_id NOT LIKE 'ag_%';
UPDATE conversation SET agent_id = 'ag_' || agent_id WHERE agent_id NOT LIKE 'ag_%';
UPDATE agent_task_queue SET agent_id = 'ag_' || agent_id WHERE agent_id NOT LIKE 'ag_%';
UPDATE emails SET agent_id = 'ag_' || agent_id WHERE agent_id NOT LIKE 'ag_%';

-- =========================================================================
-- Step 3: Add workspace_id to agent_whitelist and emails
-- =========================================================================
ALTER TABLE agent_whitelist ADD COLUMN workspace_id TEXT;
UPDATE agent_whitelist SET workspace_id = (SELECT workspace_id FROM agent WHERE agent.id = agent_whitelist.agent_id);

ALTER TABLE emails ADD COLUMN workspace_id TEXT;
UPDATE emails SET workspace_id = (SELECT workspace_id FROM agent WHERE agent.id = emails.agent_id);

-- =========================================================================
-- Step 4: Recreate agent table with composite PK
-- =========================================================================
CREATE TABLE agent_new (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  runtime_id TEXT REFERENCES agent_runtime(id),
  runtime_mode TEXT NOT NULL DEFAULT 'local',
  runtime_config TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'idle',
  max_concurrent_tasks INTEGER NOT NULL DEFAULT 6,
  owner_id TEXT REFERENCES "user"(id),
  tools TEXT,
  triggers TEXT,
  email_handle TEXT UNIQUE,
  forward_to_email TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (id, workspace_id)
);
INSERT INTO agent_new SELECT * FROM agent;
DROP TABLE agent;
ALTER TABLE agent_new RENAME TO agent;

-- =========================================================================
-- Step 5: Recreate agent_whitelist with updated constraint and composite FK
-- =========================================================================
CREATE TABLE agent_whitelist_new (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (agent_id, workspace_id, email),
  FOREIGN KEY (agent_id, workspace_id) REFERENCES agent(id, workspace_id) ON DELETE CASCADE
);
INSERT INTO agent_whitelist_new SELECT id, agent_id, workspace_id, email, created_at FROM agent_whitelist;
DROP TABLE agent_whitelist;
ALTER TABLE agent_whitelist_new RENAME TO agent_whitelist;

-- =========================================================================
-- Step 6: Recreate conversation with composite FK
-- =========================================================================
CREATE TABLE conversation_new (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id, workspace_id) REFERENCES agent(id, workspace_id) ON DELETE CASCADE
);
INSERT INTO conversation_new SELECT * FROM conversation;
DROP TABLE conversation;
ALTER TABLE conversation_new RENAME TO conversation;

-- =========================================================================
-- Step 7: Recreate agent_task_queue with composite FK
-- =========================================================================
CREATE TABLE agent_task_queue_new (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL REFERENCES agent_runtime(id),
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  conversation_id TEXT NOT NULL REFERENCES conversation(id),
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  result TEXT,
  context TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY (agent_id, workspace_id) REFERENCES agent(id, workspace_id) ON DELETE CASCADE
);
INSERT INTO agent_task_queue_new SELECT * FROM agent_task_queue;
DROP TABLE agent_task_queue;
ALTER TABLE agent_task_queue_new RENAME TO agent_task_queue;

-- Recreate indexes on agent_task_queue
CREATE UNIQUE INDEX idx_one_pending_per_conversation ON agent_task_queue(conversation_id) WHERE status IN ('queued', 'dispatched');
CREATE INDEX idx_task_queue_pending ON agent_task_queue(agent_id, status) WHERE status IN ('queued', 'dispatched');

-- =========================================================================
-- Step 8: Recreate emails with composite FK
-- =========================================================================
CREATE TABLE emails_new (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  r2_key TEXT NOT NULL,
  is_whitelisted INTEGER NOT NULL DEFAULT 0,
  forwarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id, workspace_id) REFERENCES agent(id, workspace_id) ON DELETE CASCADE
);
INSERT INTO emails_new SELECT id, agent_id, workspace_id, from_email, to_email, subject, r2_key, is_whitelisted, forwarded, created_at FROM emails;
DROP TABLE emails;
ALTER TABLE emails_new RENAME TO emails;

PRAGMA foreign_keys = ON;
