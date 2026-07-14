import { NextRequest } from "next/server";
import { CreateCompanyDocRequestSchema, queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { parseBody, writeError, writeJSON } from "@/lib/middleware/helpers";
import { companyDocToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const q = req.nextUrl.searchParams.get("q");

  const rows = q
    ? await queries.companyDoc.searchDocs(db, ws.workspaceId, q)
    : await queries.companyDoc.listRecentDocs(db, ws.workspaceId);

  return writeJSON(rows.map(companyDocToResponse));
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) return writeError("agentId is required", 400);

  const agent = await queries.agent.getAgent(db, agentId, ws.workspaceId, ctx.userId);
  if (!agent) return writeError("agent not found in workspace", 404);

  const [body, err] = await parseBody(req, CreateCompanyDocRequestSchema);
  if (err) return err;

  const created = await queries.companyDoc.createDoc(db, {
    workspaceId: ws.workspaceId,
    title: body.title,
    content: body.content,
    tags: body.tags,
    authorAgentId: agentId,
  });

  return writeJSON(companyDocToResponse(created), 201);
});
