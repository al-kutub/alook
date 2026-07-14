-- Company wiki: shared, cross-agent knowledge store. See schema.ts's
-- companyDoc table for the Drizzle-modeled side; the FTS5 index below is
-- created here only (virtual tables aren't modeled in Drizzle), same
-- pattern as community_message_fts in 0044_community_tables.sql.

CREATE TABLE company_doc (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  author_agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_company_doc_workspace ON company_doc(workspace_id, updated_at);

-- FTS5 virtual table for wiki search
CREATE VIRTUAL TABLE company_doc_fts USING fts5(
  id UNINDEXED,
  workspace_id UNINDEXED,
  title,
  content,
  tags,
  tokenize='unicode61'
);

-- FTS5 sync triggers
CREATE TRIGGER company_doc_fts_insert AFTER INSERT ON company_doc BEGIN
  INSERT INTO company_doc_fts(id, workspace_id, title, content, tags)
  VALUES (new.id, new.workspace_id, new.title, new.content, new.tags);
END;

CREATE TRIGGER company_doc_fts_update AFTER UPDATE ON company_doc BEGIN
  DELETE FROM company_doc_fts WHERE id = old.id;
  INSERT INTO company_doc_fts(id, workspace_id, title, content, tags)
  VALUES (new.id, new.workspace_id, new.title, new.content, new.tags);
END;

CREATE TRIGGER company_doc_fts_delete AFTER DELETE ON company_doc BEGIN
  DELETE FROM company_doc_fts WHERE id = old.id;
END;
