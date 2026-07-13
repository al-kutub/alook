import { NextRequest } from "next/server";
import { UpdateGoalRequestSchema, queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { parseBody, writeJSON, writeError } from "@/lib/middleware/helpers";
import { goalToResponse } from "@/lib/api/responses";

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const goalId = ctx.params?.id;
  if (!goalId) return writeError("goal id is required", 400);

  const [body, err] = await parseBody(req, UpdateGoalRequestSchema);
  if (err) return err;

  const db = getDb(ctx.env.DB);
  const updated = await queries.goal.updateGoalStatus(db, goalId, ws.workspaceId, body.status);
  if (!updated) return writeError("goal not found", 404);
  return writeJSON(goalToResponse(updated));
});
