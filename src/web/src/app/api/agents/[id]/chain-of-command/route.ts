import { queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, writeError } from "@/lib/middleware/helpers";

// The chain of managers from this agent up to the root (e.g. the CEO),
// closest manager first — what an agent escalates a blocker up through.
export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const id = ctx.params?.id;
  if (!id) return writeError("agent id is required", 400);

  const db = getDb(ctx.env.DB);
  const agent = await queries.agent.getAgent(db, id, ws.workspaceId);
  if (!agent) return writeError("agent not found", 404);

  const chain = await queries.agent.getChainOfCommand(db, id, ws.workspaceId);
  return writeJSON(chain.map((n) => ({
    id: n.id,
    name: n.name,
    reports_to: n.reportsTo,
    status: n.status,
  })));
});
