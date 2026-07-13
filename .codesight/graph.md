# Dependency Graph

## Most Imported Files (change these carefully)

- `src/shared/src/db/index.ts` — imported by **59** files
- `src/shared/src/db/schema.ts` — imported by **52** files
- `src/web/src/components/community/_types.ts` — imported by **38** files
- `src/daemon/src/types.ts` — imported by **37** files
- `src/daemon/src/server/contract.ts` — imported by **22** files
- `src/daemon/src/runtimeConfig.ts` — imported by **19** files
- `src/shared/src/db/community-schema.ts` — imported by **18** files
- `src/cli/daemon/types.ts` — imported by **17** files
- `src/web/src/components/community/avatar.tsx` — imported by **15** files
- `src/cli/lib/logger.ts` — imported by **14** files
- `src/web/src/lib/api/client.ts` — imported by **14** files
- `src/app/src/lib/constants.ts` — imported by **13** files
- `src/web/src/lib/templates/types.ts` — imported by **13** files
- `src/cli/lib/config.ts` — imported by **12** files
- `src/daemon/src/logger.ts` — imported by **12** files
- `src/daemon/src/drivers/probe.ts` — imported by **12** files
- `src/shared/src/schemas.ts` — imported by **12** files
- `src/shared/src/constants.ts` — imported by **12** files
- `src/cli/lib/shell-env.ts` — imported by **11** files
- `src/cli/daemon/kill-tree.ts` — imported by **11** files

## Import Map (who imports what)

- `src/shared/src/db/index.ts` ← `src/shared/src/community/wake-dispatch.ts`, `src/shared/src/db/queries/agent-access.ts`, `src/shared/src/db/queries/agent-link.ts`, `src/shared/src/db/queries/agent-pin.ts`, `src/shared/src/db/queries/agent-sidebar-order.ts` +54 more
- `src/shared/src/db/schema.ts` ← `src/shared/src/db/community-machine-schema.ts`, `src/shared/src/db/community-schema.ts`, `src/shared/src/db/index.ts`, `src/shared/src/db/queries/agent-access.ts`, `src/shared/src/db/queries/agent-link.ts` +47 more
- `src/web/src/components/community/_types.ts` ← `src/web/src/components/community/avatar.tsx`, `src/web/src/components/community/channel-header.tsx`, `src/web/src/components/community/channel-sidebar.tsx`, `src/web/src/components/community/community-inbox-popover.tsx`, `src/web/src/components/community/community-panel-sheet.tsx` +33 more
- `src/daemon/src/types.ts` ← `src/daemon/src/daemon/createDaemon.test.ts`, `src/daemon/src/daemon/createDaemon.ts`, `src/daemon/src/discovery.ts`, `src/daemon/src/drivers/antigravity.ts`, `src/daemon/src/drivers/claude.ts` +32 more
- `src/daemon/src/server/contract.ts` ← `src/daemon/scripts/localBridge.ts`, `src/daemon/scripts/mock-server.ts`, `src/daemon/src/cli/index.test.ts`, `src/daemon/src/cli/index.ts`, `src/daemon/src/credentials/credentialProxy.ts` +17 more
- `src/daemon/src/runtimeConfig.ts` ← `src/daemon/scripts/mock-server.ts`, `src/daemon/src/daemon/createDaemon.ts`, `src/daemon/src/drivers/claudeLaunch.ts`, `src/daemon/src/drivers/cliTransport.test.ts`, `src/daemon/src/drivers/cliTransport.ts` +14 more
- `src/shared/src/db/community-schema.ts` ← `src/shared/src/db/index.ts`, `src/shared/src/db/queries/community/attachment.ts`, `src/shared/src/db/queries/community/audit-log.ts`, `src/shared/src/db/queries/community/category.ts`, `src/shared/src/db/queries/community/dm.ts` +13 more
- `src/cli/daemon/types.ts` ← `src/cli/daemon/agent/__tests__/claude.test.ts`, `src/cli/daemon/agent/__tests__/codex.test.ts`, `src/cli/daemon/agent/__tests__/opencode.test.ts`, `src/cli/daemon/client.test.ts`, `src/cli/daemon/daemon.ts` +12 more
- `src/web/src/components/community/avatar.tsx` ← `src/web/src/components/community/channel-members-dialog.tsx`, `src/web/src/components/community/community-inbox-popover.tsx`, `src/web/src/components/community/composer.tsx`, `src/web/src/components/community/dm-header.tsx`, `src/web/src/components/community/dm-sidebar.tsx` +10 more
- `src/cli/lib/logger.ts` ← `src/cli/commands/email.ts`, `src/cli/daemon/daemon.ts`, `src/cli/daemon/execenv/steering.ts`, `src/cli/daemon/execenv/timeline.ts`, `src/cli/daemon/kill-tree.ts` +9 more
