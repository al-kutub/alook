CREATE TABLE product (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id TEXT,
  created_by_agent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_product_workspace ON product(workspace_id, status);

ALTER TABLE issue ADD COLUMN product_id TEXT;
CREATE INDEX idx_issue_product ON issue(product_id);
