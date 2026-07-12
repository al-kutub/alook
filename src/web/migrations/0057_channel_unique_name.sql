-- Two top-level channels in the same server can no longer share a name.
-- Threads/forum posts are also community_channel rows (parent_channel_id
-- NOT NULL) and are exempt — those names are free-form/derived from message
-- content and collisions there are expected and harmless.
CREATE UNIQUE INDEX idx_channel_server_name ON community_channel(server_id, name) WHERE parent_channel_id IS NULL;
