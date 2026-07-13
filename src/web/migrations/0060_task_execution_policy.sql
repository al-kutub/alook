-- Execution policy (review/approval gates) — see
-- TaskService.routeThroughExecutionPolicy / recordExecutionDecision in
-- src/web/src/lib/services/task.ts.
--
-- execution_policy: null = no policy, task completes normally on finish.
-- execution_state: runtime cursor through the policy stages; null until a
-- policy is set and the task first attempts to finish.
ALTER TABLE agent_task_queue ADD COLUMN execution_policy TEXT;
ALTER TABLE agent_task_queue ADD COLUMN execution_state TEXT;

-- Audit trail: one row per review/approval decision (approve or
-- request-changes). Both outcomes require a non-empty `body`.
CREATE TABLE task_execution_decision (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_task_queue(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  stage_type TEXT NOT NULL,
  actor_agent_id TEXT,
  actor_user_id TEXT,
  outcome TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_task_execution_decision_task ON task_execution_decision(task_id, created_at);
CREATE INDEX idx_task_execution_decision_workspace ON task_execution_decision(workspace_id, created_at);
