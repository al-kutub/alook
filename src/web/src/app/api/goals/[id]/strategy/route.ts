import { NextRequest } from "next/server";
import { ProposeStrategyRequestSchema, queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { parseBody, writeJSON, writeError } from "@/lib/middleware/helpers";
import { strategyToResponse } from "@/lib/api/responses";

// An agent proposes a strategy for a goal (typically the CEO — see
// heartbeat.ts's nudge). Same dual-caller auth shape as
// /api/tasks/{id}/execution-decision: a machine token acting on behalf of
// an agent must pass actor_agent_id; a signed-in human may also propose
// directly (e.g. board operator drafting a strategy themselves).
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const goalId = ctx.params?.id;
  if (!goalId) return writeError("goal id is required", 400);

  const [body, err] = await parseBody(req, ProposeStrategyRequestSchema);
  if (err) return err;

  const isMachineActor = !!ctx.workspaceId;
  if (isMachineActor && !body.actor_agent_id) {
    return writeError("actor_agent_id is required for machine-token callers", 400);
  }
  const proposedByAgentId = body.actor_agent_id ?? ctx.userId ?? "unknown";

  const db = getDb(ctx.env.DB);
  const goal = await queries.goal.getGoal(db, goalId, ws.workspaceId);
  if (!goal) return writeError("goal not found", 404);

  const created = await queries.goal.createStrategy(db, {
    goalId,
    workspaceId: ws.workspaceId,
    proposedByAgentId,
    content: body.content,
  });
  return writeJSON(strategyToResponse(created), 201);
});
