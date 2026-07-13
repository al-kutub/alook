-- Comment-required backstop: every agent task reaching a terminal status
-- (completed/failed) must leave at least one message before the run is
-- considered truly finished. See enforceCommentBackstop in
-- src/web/src/lib/services/task.ts.
ALTER TABLE agent_task_queue ADD COLUMN comment_status TEXT;
ALTER TABLE agent_task_queue ADD COLUMN comment_retry_queued_at TEXT;

-- message.task_id had no index; the backstop check does a point lookup by
-- task_id on every terminal transition.
CREATE INDEX idx_message_task_id ON message(task_id);
