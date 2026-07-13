-- Cost/budget tracking — see queries/cost-event.ts and TaskService
-- (enqueueTask budget gate) in src/web/src/lib/services/task.ts.
--
-- budget_monthly_cents: null = unlimited, no budget enforcement.
-- spent_monthly_cents is NOT stored here — it's computed live as
-- SUM(cost_event.cost_cents) for the current calendar month (see
-- queries/cost-event.ts getMonthlySpentCents). No reset/staleness logic
-- needed; matches this codebase's existing live-query patterns.
--
-- paused_reason: set to 'budget_exceeded' when a dispatch attempt is
-- rejected for being at/over budget; cleared automatically the next time an
-- enqueue attempt finds the agent back under budget (e.g. after month
-- rollover or a budget increase). Kept independent of the `agent.status`
-- enum so it doesn't collide with the existing active/inactive/error /
-- idle/working runtime-status values.
ALTER TABLE agent ADD COLUMN budget_monthly_cents INTEGER;
ALTER TABLE agent ADD COLUMN paused_reason TEXT;

-- One row per cost-reporting event. Best-effort: not every backend/adapter
-- reports real token/cost data (e.g. cursor-agent's stream-json currently
-- has no usage/cost field at all — see CursorBackend). token/cost columns
-- are nullable; a row with all-null usage still counts as a recorded task
-- completion for that agent/month.
CREATE TABLE cost_event (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  task_id TEXT REFERENCES agent_task_queue(id) ON DELETE SET NULL,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_cents INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_cost_event_agent_created ON cost_event(agent_id, workspace_id, created_at);
CREATE INDEX idx_cost_event_workspace_created ON cost_event(workspace_id, created_at);
CREATE INDEX idx_cost_event_task ON cost_event(task_id);
