ALTER TABLE message ADD COLUMN attachment_ids TEXT;
ALTER TABLE artifact ADD COLUMN source TEXT NOT NULL DEFAULT 'agent';