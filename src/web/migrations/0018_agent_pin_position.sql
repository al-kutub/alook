ALTER TABLE agent_pin ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE agent_pin SET position = (
  SELECT COUNT(*) FROM agent_pin AS p2
  WHERE p2.workspace_id = agent_pin.workspace_id
    AND p2.user_id = agent_pin.user_id
    AND p2.created_at < agent_pin.created_at
);
