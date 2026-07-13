import { NextRequest } from "next/server";
import { DecideStrategyRequestSchema, GoalStrategyStatus, queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { parseBody, writeJSON, writeError } from "@/lib/middleware/helpers";
import { strategyToResponse } from "@/lib/api/responses";

// Only a signed-in human decides a strategy proposal — this is the actual
// board-approval gate (Paperclip: "your first strategic plan requires
// board approval"). Machine-token/agent callers are rejected outright,
// unlike the execution-decision endpoint where an agent CAN be the
// reviewer — a strategy approval is deliberately human-only.
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;
  if (!ctx.userId) {
    return writeError("strategy decisions must be made by a signed-in user, not a machine token", 403);
  }

  const strategyId = ctx.params?.id;
  if (!strategyId) return writeError("strategy id is required", 400);

  const [body, err] = await parseBody(req, DecideStrategyRequestSchema);
  if (err) return err;

  const db = getDb(ctx.env.DB);
  const strategy = await queries.goal.getStrategy(db, strategyId, ws.workspaceId);
  if (!strategy) return writeError("strategy not found", 404);
  if (strategy.status !== GoalStrategyStatus.PENDING) {
    return writeError(`strategy already decided (status: ${strategy.status})`, 400);
  }

  const status = body.outcome === "approved" ? GoalStrategyStatus.APPROVED : GoalStrategyStatus.REJECTED;
  const updated = await queries.goal.decideStrategy(db, strategyId, ws.workspaceId, {
    status,
    decidedByUserId: ctx.userId,
    decisionComment: body.comment,
  });
  if (!updated) return writeError("strategy not found", 404);
  return writeJSON(strategyToResponse(updated));
});
