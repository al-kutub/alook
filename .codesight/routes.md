# Routes

- `GET` `/api/cli/latest-version`
- `GET` `/api/daily-quote` → out: { q, a } [cache]
- `GET` `/api/desktop/update/[target]/[arch]/[current_version]` params(target, arch, current_version) → out: { error } [cache]
- `GET` `/api/health` → out: { status }
- `GET` `/blog/feed.xml` [auth]
- `GET` `/og` [cache]
- `GET` `/onboard.md` [auth]
- `GET` `/templates/[id]/json` params(id) → out: { error }

## WebSocket Events

- `WS` `close` — `src/daemon/src/credentials/credentialProxy.test.ts`
- `WS` `${req.name}` — `src/daemon/src/server/mockServer.ts`
- `WS` `open` — `src/daemon/src/server/wsControlChannel.ts`
- `WS` `message` — `src/daemon/src/server/wsControlChannel.ts`
- `WS` `pong` — `src/daemon/src/server/wsControlChannel.ts`
- `WS` `close` — `src/daemon/src/server/wsControlChannel.ts`
- `WS` `error` — `src/daemon/src/server/wsControlChannel.ts`
- `WS` `message` — `src/daemon/src/server/wsControlServer.ts`
- `WS` `close` — `src/daemon/src/server/wsControlServer.ts`
- `WS` `error` — `src/daemon/src/server/wsControlServer.ts`
- `WS` `latest-created` — `src/web/src/components/agent-chat/agent-chat-view.test.ts`
