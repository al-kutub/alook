-- Heartbeat: agents can be woken on a configurable interval to check up on
-- outstanding/long-running work and keep the company moving forward.
ALTER TABLE agent ADD COLUMN heartbeat_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent ADD COLUMN heartbeat_interval_seconds INTEGER NOT NULL DEFAULT 1800;
ALTER TABLE agent ADD COLUMN last_heartbeat_at TEXT;
