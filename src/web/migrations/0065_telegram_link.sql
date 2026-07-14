-- Maps a Telegram chat to an alook conversation, one row per chat, created
-- lazily on the first allowed inbound message. See src/web/src/app/api/webhooks/telegram/route.ts.

CREATE TABLE telegram_link (
  chat_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_telegram_link_conversation ON telegram_link(conversation_id);
