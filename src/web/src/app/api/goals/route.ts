import { NextRequest } from "next/server";
import { CreateGoalRequestSchema, queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { parseBody, writeJSON, writeError } from "@/lib/middleware/helpers";
import { goalToResponse } from "@/lib/api/responses";

// Company goals are created by a human board operator, never by an agent —
// mirrors Paperclip's board-operator delegation model (goals in, strategy
// approvals out, agents never self-assign a company-level objective).
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const rows = await queries.goal.listGoals(db, ws.workspaceId);
  return writeJSON(rows.map(goalToResponse));
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;
  if (!ctx.userId) {
    return writeError("goals must be created by a signed-in user, not a machine token", 403);
  }

  const [body, err] = await parseBody(req, CreateGoalRequestSchema);
  if (err) return err;

  const db = getDb(ctx.env.DB);
  const created = await queries.goal.createGoal(db, {
    workspaceId: ws.workspaceId,
    title: body.title,
    description: body.description,
    createdByUserId: ctx.userId,
  });
  return writeJSON(goalToResponse(created), 201);
});
