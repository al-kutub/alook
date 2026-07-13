-- Company goals + CEO strategy approval gate — see queries/goal.ts,
-- TaskService.enqueueTask (goal gate), and heartbeat.ts (strategy nudge).
--
-- A goal is created by a human. Before any task can be created against a
-- goal (task.goal_id set), that goal needs an APPROVED strategy proposal.
-- Strategy proposals are made by an agent (typically the CEO — alook has no
-- formal "role" field yet, so callers identify the CEO the same name-match
-- heuristic the heartbeat feature already uses) and decided by a human.
CREATE TABLE company_goal (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_company_goal_workspace_status ON company_goal(workspace_id, status);

-- One row per proposal. A goal can have multiple rows over time (a
-- rejected proposal gets revised and re-proposed as a NEW row, not
-- mutated in place — preserves the audit trail, mirrors
-- task_execution_decision's append-only shape). Only the latest row per
-- goal matters for the gate check (see getLatestStrategyForGoal).
CREATE TABLE goal_strategy (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES company_goal(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  proposed_by_agent_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by_user_id TEXT,
  decision_comment TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE INDEX idx_goal_strategy_goal_created ON goal_strategy(goal_id, created_at);
CREATE INDEX idx_goal_strategy_workspace_status ON goal_strategy(workspace_id, status);

ALTER TABLE agent_task_queue ADD COLUMN goal_id TEXT;
CREATE INDEX idx_task_queue_goal ON agent_task_queue(goal_id);
