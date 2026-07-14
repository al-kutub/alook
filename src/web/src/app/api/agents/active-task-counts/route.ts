import { queries } from "@alook/shared";
import { getDb, withD1Retry } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON } from "@/lib/middleware/helpers";
import { cached, cacheKeys } from "@/lib/cache";
import { filterVisibleAgents } from "@/lib/agent-visibility";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);

  const [allAgents, allAccess] = await Promise.all([
    withD1Retry(() => queries.agent.getAllAgentsForWorkspace(db, ws.workspaceId)),
    cached(cacheKeys.allAgentAccess(ws.workspaceId), 300, () => withD1Retry(() => queries.agentAccess.getAllAgentAccessForWorkspace(db, ws.workspaceId))),
  ]);
  const agents = filterVisibleAgents(allAgents, ctx.userId, allAccess);
  const visibleAgentIds = agents.map((a) => a.id);

  if (visibleAgentIds.length === 0) return writeJSON({ counts: {} });

  const rows = await withD1Retry(() => queries.task.listActiveTaskCountsByWorkspace(db, ws.workspaceId, visibleAgentIds, ctx.userId));
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.agentId] = Number(row.count);
  }

  return writeJSON({ counts });
});
