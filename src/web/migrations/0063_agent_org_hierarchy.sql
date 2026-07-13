-- Enforced org hierarchy: reportsTo + chain of command — see
-- queries/agent.ts (getOrgChart, getChainOfCommand, updateAgent's
-- reportsTo validation) and PATCH /api/agents/{id}.
--
-- Distinct from agent_link (a free-form many-to-many collaboration graph
-- with per-edge instructions, used for the visual org-chart connectors
-- already in the UI) — reports_to is a STRICT tree: single parent per
-- agent, no cycles, enforced at write time in updateAgent's reportsTo
-- validation (walks the new manager's chain to reject a cycle before
-- persisting). Root agents (e.g. the CEO) have reports_to = NULL.
--
-- No SQL foreign-key constraint: agent's primary key is composite
-- (id, workspace_id), so a plain reports_to TEXT column can't declare a
-- real FK to it without also carrying workspace_id — validated in
-- application code instead (matches how agent.owner_id/agent_id already
-- work elsewhere in this schema without a composite FK).
ALTER TABLE agent ADD COLUMN reports_to TEXT;

CREATE INDEX idx_agent_reports_to ON agent(workspace_id, reports_to);
