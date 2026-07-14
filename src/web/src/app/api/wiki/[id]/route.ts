import { NextRequest } from "next/server";
import { UpdateCompanyDocRequestSchema, queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { parseBody, writeError, writeJSON } from "@/lib/middleware/helpers";
import { companyDocToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const id = ctx.params?.id;
  if (!id) return writeError("doc id is required", 400);

  const doc = await queries.companyDoc.getDoc(db, id, ws.workspaceId);
  if (!doc) return writeError("doc not found", 404);

  return writeJSON(companyDocToResponse(doc));
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const id = ctx.params?.id;
  if (!id) return writeError("doc id is required", 400);

  const existing = await queries.companyDoc.getDoc(db, id, ws.workspaceId);
  if (!existing) return writeError("doc not found", 404);

  const [body, err] = await parseBody(req, UpdateCompanyDocRequestSchema);
  if (err) return err;

  const updated = await queries.companyDoc.updateDoc(db, id, ws.workspaceId, {
    title: body.title,
    content: body.content,
    tags: body.tags,
  });
  if (!updated) return writeError("doc not found", 404);

  return writeJSON(companyDocToResponse(updated));
});
